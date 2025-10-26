import json
import boto3
import base64
import os

rekognition = boto3.client('rekognition')
bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')

# Scene tracking for smart updates (unchanged)
last_scene_labels = []
last_scene_hash = None
last_full_description = ""
frame_counter = 0

def handler(event, context):
    global last_scene_labels, last_scene_hash, last_full_description, frame_counter
    
    print('=== NEW REQUEST ===')
    frame_counter += 1
    
    try:
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        
        image_base64 = body.get('image')
        is_continuous = bool(body.get('continuous', False))

        # NEW: narration & warn switches
        tell = bool(body.get('tell', False))          # if True -> generate full description
        warn_only = body.get('warnOnly', True)        # default True -> only warn when needed

        if not image_base64:
            return create_response(400, {'error': 'No image provided'})
        
        if 'base64,' in image_base64:
            image_base64 = image_base64.split('base64,')[1]
        
        image_bytes = base64.b64decode(image_base64)
        print(f"Frame #{frame_counter}, Size: {len(image_bytes)} bytes, Continuous: {is_continuous}, Tell: {tell}, WarnOnly: {warn_only}")
        
        # Detect labels (with instances) and text
        labels_response = rekognition.detect_labels(
            Image={'Bytes': image_bytes},
            MaxLabels=20,
            MinConfidence=60,
            Features=['GENERAL_LABELS', 'IMAGE_PROPERTIES']
        )
        text_response = rekognition.detect_text(Image={'Bytes': image_bytes})

        # Build scene signature (unchanged) for smart updates
        current_labels = [label['Name'] for label in labels_response.get('Labels', [])[:10]]
        scene_signature = create_scene_signature(labels_response, text_response)
        scene_changed = has_scene_changed(scene_signature, current_labels)

        # Extract image dims (if returned)
        image_props = labels_response.get('ImageProperties', {})
        image_width = image_props.get('Width', 0)
        image_height = image_props.get('Height', 0)

        # Extract boxes first (we’ll reuse for hazard calc)
        bounding_boxes = extract_bounding_boxes(labels_response, image_width, image_height)

        # NEW: pedestrian hazard detection
        alert = detect_pedestrian_alert(bounding_boxes)

        # Decide what to say/return
        ai_description = None
        should_speak = False

        if alert['level'] != 'none':
            # High-priority safety message overrides silence
            ai_description = alert['message']
            should_speak = True
            print(f"[ALERT] {ai_description}")

        # Only narrate if the user asked OR we need to alert
        elif tell:
            if (not is_continuous) or scene_changed or not last_full_description:
                ai_description = generate_full_description(labels_response, text_response, image_base64)
                last_full_description = ai_description
                last_scene_labels = current_labels
                last_scene_hash = scene_signature
            else:
                ai_description = last_full_description
            should_speak = True  # they explicitly asked us to tell them

        else:
            # Silent path: no alert and user didn't ask → no new narration
            ai_description = None
            should_speak = False

        return create_response(200, {
            'aiDescription': ai_description,          # may be None when silent
            'labels': labels_response['Labels'],
            'text': text_response.get('TextDetections', []),
            'boundingBoxes': bounding_boxes,
            'imageWidth': image_width,
            'imageHeight': image_height,
            'sceneChanged': scene_changed,
            'alert': alert,                            # {level, message, count, nearestBox?}
            'shouldSpeak': should_speak                # frontend can gate TTS on this
        })
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': str(e)})

def create_scene_signature(labels_response, text_response):
    labels = [(l['Name'], int(l.get('Confidence', 0))) for l in labels_response.get('Labels', [])[:8]]
    texts = [t.get('DetectedText','') for t in text_response.get('TextDetections', [])[:5] if t.get('Type') == 'LINE']
    signature = str(sorted(labels)) + str(sorted(texts))
    return signature

def has_scene_changed(current_signature, current_labels):
    global last_scene_hash, last_scene_labels
    if not last_scene_hash:
        return True
    if current_signature != last_scene_hash:
        current_set = set(current_labels)
        last_set = set(last_scene_labels)
        added = current_set - last_set
        removed = last_set - current_set
        change_count = len(added) + len(removed)
        total = max(len(current_set), len(last_set), 1)
        change_percentage = (change_count / total) * 100
        print(f"Scene change: {change_percentage:.1f}% (added: {added}, removed: {removed})")
        return change_percentage > 30
    return False

def generate_full_description(labels_response, text_response, image_base64):
    # (Your existing Bedrock prompt & fallbacks — unchanged)
    people_objects = []
    environment_objects = []
    items_objects = []
    for label in labels_response.get('Labels', [])[:15]:
        name = label['Name']
        confidence = label.get('Confidence', 0)
        instances = len(label.get('Instances', []))
        if name.lower() in ['person', 'people', 'human', 'face', 'head', 'hand']:
            people_objects.append(f"{name} ({int(confidence)}%)" + (f" - {instances} detected" if instances > 0 else ""))
        elif name.lower() in ['furniture', 'room', 'indoor', 'outdoor', 'building', 'wall', 'floor', 'ceiling', 'door', 'window', 'street', 'road', 'sidewalk']:
            environment_objects.append(f"{name} ({int(confidence)}%)")
        else:
            items_objects.append(f"{name} ({int(confidence)}%)" + (f" - {instances} detected" if instances > 0 else ""))

    text_items = []
    for t in text_response.get('TextDetections', []):
        if t.get('Type') == 'LINE' and t.get('Confidence', 0) > 70:
            text_items.append(t.get('DetectedText',''))

    prompt = f"""You assist a blind user. Describe only what is visible now, clearly and briefly (<=80 words).
Prioritize obstacles, people proximity, orientation cues, and short text.
People: {', '.join([o.split('(')[0].strip() for o in people_objects]) if people_objects else 'None'}
Environment: {', '.join([o.split('(')[0].strip() for o in environment_objects[:5]]) if environment_objects else 'Unknown'}
Objects: {', '.join([o.split('(')[0].strip() for o in items_objects[:6]]) if items_objects else 'None'}
Text: {', '.join(text_items[:3]) if text_items else 'None'}
Format 2–3 sentences. Use spatial terms (left, right, ahead, near)."""

    try:
        # Try Sonnet-4 first
        try:
            response = bedrock_runtime.invoke_model(
                modelId='anthropic.claude-sonnet-4-20250514',
                body=json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 300,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type":"image","source":{"type":"base64","media_type":"image/jpeg","data": image_base64}},
                            {"type":"text","text": prompt}
                        ]
                    }]
                })
            )
            response_body = json.loads(response['body'].read())
            return response_body['content'][0]['text']
        except Exception as sonnet_error:
            print(f"Sonnet 4 failed: {str(sonnet_error)}")
            # Fallback to Haiku
            response = bedrock_runtime.invoke_model(
                modelId='anthropic.claude-3-haiku-20240307-v1:0',
                body=json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 300,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type":"image","source":{"type":"base64","media_type":"image/jpeg","data": image_base64}},
                            {"type":"text","text": prompt}
                        ]
                    }]
                })
            )
            response_body = json.loads(response['body'].read())
            return response_body['content'][0]['text']
    except Exception as e:
        print(f"ALL BEDROCK MODELS FAILED: {e}")
        # fallback summary
        parts = []
        if environment_objects: parts.append(f"Environment: {', '.join([o.split('(')[0].strip() for o in environment_objects[:3]])}")
        if people_objects: parts.append(f"People: {', '.join([o.split('(')[0].strip() for o in people_objects[:2]])}")
        if items_objects: parts.append(f"Objects: {', '.join([o.split('(')[0].strip() for o in items_objects[:3]])}")
        if text_items: parts.append(f'Text visible: "{text_items[0]}"')
        return ". ".join(parts) if parts else "Analyzing scene..."

def extract_bounding_boxes(labels_response, img_width, img_height):
    boxes = []
    for label in labels_response.get('Labels', []):
        if 'Instances' in label and label['Instances']:
            for instance in label['Instances']:
                if 'BoundingBox' in instance:
                    bb = instance['BoundingBox']
                    conf = instance.get('Confidence', label.get('Confidence', 0))
                    boxes.append({
                        'label': label['Name'],
                        'confidence': round(conf, 2),
                        'box': {
                            'left': float(bb.get('Left', 0)),
                            'top': float(bb.get('Top', 0)),
                            'width': float(bb.get('Width', 0)),
                            'height': float(bb.get('Height', 0))
                        }
                    })
    return boxes

# NEW: pedestrian hazard detection
def detect_pedestrian_alert(boxes):
    """
    Heuristic:
      - 'person' detections near the center (x in ~[0.35, 0.65]) are "ahead"
      - closeness by box height: >=0.35 very close, 0.25-0.35 near
    Returns {level: 'none'|'warning', message: str, count: int, nearestBox: {...}|None}
    """
    persons = [b for b in boxes if b.get('label','').lower() in ('person','people','human')]
    if not persons:
        return {'level':'none', 'message':'', 'count':0, 'nearestBox': None}

    # score: prioritize centered & larger (closer)
    def score(p):
        bx = p['box']
        center_x = bx['left'] + bx['width']/2.0
        centered = 1.0 - abs(center_x - 0.5) * 2.0  # 1 at center, ~0 near edges
        size = bx['height']                          # height fraction of frame
        return (centered * 0.6) + (min(size, 1.0) * 0.4)

    persons_sorted = sorted(persons, key=score, reverse=True)
    nearest = persons_sorted[0]
    bx = nearest['box']
    center_x = bx['left'] + bx['width']/2.0
    size_h = bx['height']

    is_centered = (0.35 <= center_x <= 0.65)
    very_close = size_h >= 0.35
    near = size_h >= 0.25

    # Only warn if centered & near
    if is_centered and (very_close or near):
        proximity = "very close" if very_close else "near"
        msg = f"Warning: pedestrian {proximity} ahead."
        return {'level':'warning', 'message': msg, 'count': len(persons), 'nearestBox': nearest}
    else:
        return {'level':'none', 'message':'', 'count': len(persons), 'nearestBox': None}

def create_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body)
    }
