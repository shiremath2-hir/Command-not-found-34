import json
import boto3
import base64
import os
import traceback
from math import radians, sin, cos, sqrt, atan2

# Initialize AWS clients with error handling
try:
    rekognition = boto3.client('rekognition', region_name='us-east-1')
    bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
except Exception as e:
    print(f"ERROR initializing AWS clients: {e}")
    rekognition = None
    bedrock = None

GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# Cache globals
last_desc, last_hash = "", None
last_scene_labels = []
frame_counter = 0


def handler(event, context):
    """Main Lambda handler with comprehensive error handling"""
    global last_desc, last_hash, last_scene_labels, frame_counter
    
    frame_counter += 1
    print(f"=== REQUEST #{frame_counter} ===")
    
    try:
        # Handle CORS preflight
        if event.get("httpMethod") == "OPTIONS":
            return cors_response(200, {"message": "CORS preflight success"})

        # Parse body
        try:
            if isinstance(event.get('body'), str):
                body = json.loads(event['body'])
            else:
                body = event.get('body', {})
        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}")
            return cors_response(400, {'error': 'Invalid JSON in request body'})
        
        print(f"Parsed body keys: {body.keys()}")
        
        # Validate image data
        img_b64 = body.get('image')
        if not img_b64:
            return cors_response(400, {'error': 'No image data provided'})
        
        # Clean and decode base64
        try:
            img_bytes = clean_and_decode_image(img_b64)
            print(f"Image decoded successfully. Size: {len(img_bytes)} bytes")
        except Exception as e:
            print(f"Image decode error: {e}")
            return cors_response(400, {'error': f'Image decode failed: {str(e)}'})
        
        # Extract parameters
        is_continuous = body.get('continuous', False)
        tell = body.get('tell', False)
        warn_only = body.get('warnOnly', True)
        
        # Navigation parameters
        user_lat = body.get('latitude')
        user_lng = body.get('longitude')
        dest_addr = body.get('destination_address')
        dest_lat = body.get('destination_latitude')
        dest_lng = body.get('destination_longitude')
        find_nearby = body.get('findNearby', False)
        get_route = body.get('getRoute', False)
        navigation_mode = body.get('navigationMode', False)  # New: turn-by-turn mode
        
        print(f"Params - continuous: {is_continuous}, tell: {tell}, warn: {warn_only}")
        print(f"Location - lat: {user_lat}, lng: {user_lng}, dest_addr: {dest_addr}")
        print(f"Navigation - mode: {navigation_mode}, nearby: {find_nearby}, route: {get_route}")
        
        # Vision analysis
        labels = {}
        text = {'TextDetections': []}
        boxes = []
        alert = {"level": "none", "message": ""}
        scene_changed = False
        
        if rekognition:
            try:
                print("Calling Rekognition detect_labels...")
                labels = rekognition.detect_labels(
                    Image={'Bytes': img_bytes},
                    MaxLabels=20,
                    MinConfidence=60,
                    Features=['GENERAL_LABELS', 'IMAGE_PROPERTIES']
                )
                print(f"Labels detected: {len(labels.get('Labels', []))}")
                
                # Scene change detection
                current_labels = [l['Name'] for l in labels.get('Labels', [])[:10]]
                scene_changed = has_scene_changed(current_labels)
                
            except Exception as e:
                print(f"Rekognition detect_labels error: {e}")
                print(traceback.format_exc())
                return cors_response(400, {
                    'error': f'Rekognition error: {str(e)}',
                    'type': type(e).__name__,
                    'details': traceback.format_exc()
                })
            
            try:
                print("Calling Rekognition detect_text...")
                text = rekognition.detect_text(Image={'Bytes': img_bytes})
            except Exception as e:
                print(f"Rekognition detect_text warning (non-fatal): {e}")
            
            boxes = extract_boxes(labels)
            alert = detect_pedestrian_alert(boxes)
        else:
            print("WARNING: Rekognition client not initialized")
        
        # AI narration logic
        ai_text = None
        should_speak = False
        
        if alert['level'] != 'none':
            # Priority: Safety alerts
            ai_text = alert['message']
            should_speak = True
            print(f"[ALERT] {ai_text}")
            
        elif tell:
            # On-demand narration
            if (not is_continuous) or scene_changed or not last_desc:
                print("Generating full AI description...")
                ai_text = describe_scene(labels, text, img_b64)
                last_desc = ai_text
                last_scene_labels = [l['Name'] for l in labels.get('Labels', [])[:10]]
                last_hash = str(labels)
            else:
                ai_text = last_desc
            should_speak = True
            
        elif navigation_mode and is_continuous:
            # Navigation mode: minimal updates, only on scene change
            if scene_changed:
                print("Scene changed during navigation - brief update")
                ai_text = describe_scene_brief(labels)
                last_desc = ai_text
                should_speak = True
        
        # Build response data
        # Convert bounding boxes to obstacles format for frontend
        obstacles = convert_boxes_to_obstacles(boxes)

        data = {
            "aiDescription": ai_text,
            "alert": alert,
            "boundingBoxes": boxes,
            "obstacles": obstacles,
            "shouldSpeak": should_speak,
            "sceneChanged": scene_changed,
            "imageWidth": labels.get('ImageProperties', {}).get('Width', 0),
            "imageHeight": labels.get('ImageProperties', {}).get('Height', 0)
        }
        
        # Maps & routing
        if GOOGLE_MAPS_API_KEY and user_lat and user_lng:
            if dest_addr or dest_lat or find_nearby or get_route or navigation_mode:
                print("Processing maps data...")
                try:
                    data["maps"] = handle_maps(
                        user_lat, user_lng, dest_lat, dest_lng, dest_addr,
                        find_nearby, get_route, navigation_mode, alert["level"]
                    )
                except Exception as e:
                    print(f"Maps processing error (non-fatal): {e}")
                    data["maps"] = {"error": str(e)}
        
        print("Request processed successfully")
        return cors_response(200, data)
    
    except Exception as e:
        print(f"UNHANDLED EXCEPTION in handler: {e}")
        print(traceback.format_exc())
        return cors_response(500, {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        })


def clean_and_decode_image(img_b64):
    """Clean and decode base64 image data"""
    if 'base64,' in img_b64:
        img_b64 = img_b64.split('base64,')[1]
    
    img_b64 = img_b64.strip().replace('\n', '').replace('\r', '').replace(' ', '')
    img_bytes = base64.b64decode(img_b64)
    
    if len(img_bytes) < 100:
        raise ValueError(f"Image data too small: {len(img_bytes)} bytes")
    
    if not (img_bytes[:2] == b'\xff\xd8' or img_bytes[:4] == b'\x89PNG'):
        raise ValueError("Image data doesn't appear to be valid JPEG or PNG")
    
    return img_bytes


def has_scene_changed(current_labels):
    """Detect if scene has significantly changed"""
    global last_scene_labels
    
    if not last_scene_labels:
        return True
    
    current_set = set(current_labels)
    last_set = set(last_scene_labels)
    added = current_set - last_set
    removed = last_set - current_set
    change_count = len(added) + len(removed)
    total = max(len(current_set), len(last_set), 1)
    change_percentage = (change_count / total) * 100
    
    print(f"Scene change: {change_percentage:.1f}% (added: {added}, removed: {removed})")
    return change_percentage > 30


def handle_maps(lat, lng, dest_lat, dest_lng, dest_addr, find_nearby, get_route, navigation_mode, alert_level):
    """Handle all maps-related operations"""
    m = {"location": {"latitude": lat, "longitude": lng}}
    
    try:
        import requests
        
        # Reverse geocode current location
        try:
            addr = reverse_geocode(lat, lng, requests)
            if addr:
                m["location"]["address"] = addr
        except Exception as e:
            print(f"Reverse geocode error: {e}")
        
        # Geocode destination if address provided
        if dest_addr and not (dest_lat and dest_lng):
            try:
                geo = geocode(dest_addr, requests)
                if geo:
                    dest_lat, dest_lng = geo
                    m["destination"] = {
                        "latitude": dest_lat,
                        "longitude": dest_lng,
                        "address": dest_addr
                    }
            except Exception as e:
                print(f"Geocode error: {e}")
        
        # Find nearby places
        if find_nearby or alert_level != 'none':
            try:
                nearby_data = {}
                
                hospitals = nearby(lat, lng, "hospital", requests, radius=3000)
                if hospitals:
                    nearby_data["hospitals"] = hospitals[:3]
                
                police = nearby(lat, lng, "police", requests, radius=3000)
                if police:
                    nearby_data["police_stations"] = police[:3]
                
                transit = nearby(lat, lng, "transit_station", requests, radius=1000)
                if transit:
                    nearby_data["transit_stations"] = transit[:3]
                
                if nearby_data:
                    m["nearby"] = nearby_data
                    
            except Exception as e:
                print(f"Nearby search error: {e}")
        
        # Get route directions
        if (get_route or navigation_mode) and dest_lat and dest_lng:
            try:
                route = directions(lat, lng, dest_lat, dest_lng, requests)
                if route:
                    m["route"] = route
                    
                    # Add next step guidance for navigation mode
                    if navigation_mode and route.get("steps"):
                        next_step = route["steps"][0]
                        m["navigation"] = {
                            "next_instruction": next_step["instruction"],
                            "distance_to_next": next_step["distance"],
                            "total_remaining": route["total_distance"],
                            "eta": route["total_duration"]
                        }
                        
            except Exception as e:
                print(f"Directions error: {e}")
        
        # Emergency route for warnings
        if alert_level == "warning" and m.get("nearby", {}).get("hospitals"):
            try:
                h = m["nearby"]["hospitals"][0]
                r = directions(lat, lng, h["location"]["lat"], h["location"]["lng"], requests)
                if r:
                    m["emergency_route"] = {
                        "destination": h["name"],
                        "address": h["address"],
                        "distance": h["distance"],
                        "directions": r
                    }
            except Exception as e:
                print(f"Emergency route error: {e}")
        
        # Static map URL
        try:
            m["map_url"] = static_map(lat, lng, dest_lat, dest_lng)
        except Exception as e:
            print(f"Static map error: {e}")
            
    except ImportError:
        m["error"] = "requests library not available"
    except Exception as e:
        m["error"] = str(e)
        print(f"Maps handler error: {e}")
    
    return m


def geocode(addr, requests):
    """Geocode an address to coordinates"""
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": addr, "key": GOOGLE_MAPS_API_KEY},
            timeout=5
        )
        if r.ok and r.json().get("results"):
            loc = r.json()["results"][0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
    except Exception as e:
        print(f"Geocode request error: {e}")
    return None


def reverse_geocode(lat, lng, requests):
    """Reverse geocode coordinates to address"""
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"latlng": f"{lat},{lng}", "key": GOOGLE_MAPS_API_KEY},
            timeout=5
        )
        if r.ok and r.json().get("results"):
            return r.json()["results"][0]["formatted_address"]
    except Exception as e:
        print(f"Reverse geocode request error: {e}")
    return None


def nearby(lat, lng, kind, requests, radius=2000):
    """Find nearby places"""
    out = []
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
            params={
                "location": f"{lat},{lng}",
                "radius": radius,
                "type": kind,
                "key": GOOGLE_MAPS_API_KEY
            },
            timeout=5
        )
        if r.ok:
            for p in r.json().get("results", [])[:5]:
                loc = p["geometry"]["location"]
                out.append({
                    "name": p["name"],
                    "address": p.get("vicinity"),
                    "rating": p.get("rating"),
                    "open_now": p.get("opening_hours", {}).get("open_now"),
                    "location": loc,
                    "distance": dist(lat, lng, loc["lat"], loc["lng"])
                })
            out.sort(key=lambda x: x["distance"])
    except Exception as e:
        print(f"Nearby search request error for {kind}: {e}")
    return out


def directions(lat1, lng1, lat2, lng2, requests):
    """Get walking directions"""
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/directions/json",
            params={
                "origin": f"{lat1},{lng1}",
                "destination": f"{lat2},{lng2}",
                "mode": "walking",
                "key": GOOGLE_MAPS_API_KEY
            },
            timeout=5
        )
        if r.ok and r.json().get("routes"):
            leg = r.json()["routes"][0]["legs"][0]
            steps = []
            for s in leg["steps"]:
                txt = s["html_instructions"].replace("<b>", "").replace("</b>", "")
                txt = txt.replace('<div style="font-size:0.9em">', ' ').replace('</div>', '')
                steps.append({
                    "instruction": txt,
                    "distance": s["distance"]["text"],
                    "duration": s["duration"]["text"],
                    "maneuver": s.get("maneuver", "straight")
                })
            return {
                "total_distance": leg["distance"]["text"],
                "total_duration": leg["duration"]["text"],
                "steps": steps,
                "start_address": leg.get("start_address"),
                "end_address": leg.get("end_address"),
                "polyline": r.json()["routes"][0]["overview_polyline"]["points"]
            }
    except Exception as e:
        print(f"Directions request error: {e}")
    return None


def static_map(lat, lng, dlat=None, dlng=None):
    """Generate static map URL"""
    url = (
        f"https://maps.googleapis.com/maps/api/staticmap?"
        f"center={lat},{lng}&zoom=16&size=600x400&"
        f"markers=color:blue|label:U|{lat},{lng}"
    )
    if dlat and dlng:
        url += (
            f"&markers=color:red|label:D|{dlat},{dlng}&"
            f"path=color:0x0000ff80|weight:5|{lat},{lng}|{dlat},{dlng}"
        )
    url += f"&key={GOOGLE_MAPS_API_KEY}"
    return url


def dist(a1, b1, a2, b2):
    """Calculate distance between two coordinates in meters"""
    R = 6371000
    dlat = radians(a2 - a1)
    dlng = radians(b2 - b1)
    h = (sin(dlat / 2) ** 2 + 
         cos(radians(a1)) * cos(radians(a2)) * sin(dlng / 2) ** 2)
    return R * 2 * atan2(sqrt(h), sqrt(1 - h))


def extract_boxes(res):
    """Extract bounding boxes from Rekognition response"""
    out = []
    try:
        for label in res.get("Labels", []):
            for instance in label.get("Instances", []):
                bb = instance.get("BoundingBox")
                if bb:
                    out.append({
                        "label": label["Name"],
                        "confidence": round(instance.get("Confidence", 0), 2),
                        "box": bb
                    })
    except Exception as e:
        print(f"Error extracting boxes: {e}")
    return out


def convert_boxes_to_obstacles(boxes):
    """Convert bounding boxes to obstacle format with distance and position"""
    obstacles = []

    for box in boxes:
        label = box.get("label", "").lower()

        # Only include relevant obstacles
        if label not in ["person", "people", "human", "car", "bicycle", "pole",
                        "post", "tree", "bench", "dog", "cat", "vehicle"]:
            continue

        bbox = box.get("box", {})

        # Calculate position (0=left, 0.5=center, 1=right)
        center_x = bbox.get("Left", 0) + (bbox.get("Width", 0) / 2.0)

        # Estimate distance based on box height (rough approximation)
        # Taller box = closer object
        height = bbox.get("Height", 0)
        if height > 0.5:
            distance = 1.0  # Very close
        elif height > 0.35:
            distance = 2.0
        elif height > 0.25:
            distance = 3.0
        elif height > 0.15:
            distance = 5.0
        else:
            distance = 10.0  # Far away

        # Normalize label
        obstacle_type = "person" if label in ["person", "people", "human"] else label

        obstacles.append({
            "type": obstacle_type,
            "distance": distance,
            "position": round(center_x, 2),
            "confidence": box.get("confidence", 0)
        })

    # Sort by distance (closest first)
    obstacles.sort(key=lambda x: x["distance"])

    return obstacles


def detect_pedestrian_alert(boxes):
    """Detect if pedestrian is in path"""
    try:
        people = [b for b in boxes
                 if b["label"].lower() in ("person", "people", "human")]
        if not people:
            return {"level": "none", "message": "", "count": 0}

        def score(p):
            bx = p["box"]
            center_x = bx["left"] + bx["width"] / 2.0
            centered = 1.0 - abs(center_x - 0.5) * 2.0
            size = bx["height"]
            return (centered * 0.6) + (min(size, 1.0) * 0.4)

        people_sorted = sorted(people, key=score, reverse=True)
        nearest = people_sorted[0]
        bx = nearest["box"]
        center_x = bx["left"] + bx["width"] / 2.0
        size_h = bx["height"]

        is_centered = (0.35 <= center_x <= 0.65)
        very_close = size_h >= 0.35
        near = size_h >= 0.25

        if is_centered and (very_close or near):
            proximity = "very close" if very_close else "near"
            msg = f"Warning: pedestrian {proximity} ahead."
            return {
                "level": "warning",
                "message": msg,
                "count": len(people),
                "nearestBox": nearest
            }

    except Exception as e:
        print(f"Error detecting pedestrian: {e}")

    return {"level": "none", "message": "", "count": 0}


def describe_scene(labels, text, img_b64):
    """Generate full AI description of scene"""
    people_objs = []
    env_objs = []
    item_objs = []
    
    for label in labels.get('Labels', [])[:15]:
        name = label['Name']
        conf = int(label.get('Confidence', 0))
        instances = len(label.get('Instances', []))
        
        if name.lower() in ['person', 'people', 'human', 'face', 'head']:
            people_objs.append(f"{name} ({conf}%)" + (f" - {instances} detected" if instances > 0 else ""))
        elif name.lower() in ['furniture', 'room', 'indoor', 'outdoor', 'building', 'wall', 'floor', 'street', 'road', 'sidewalk']:
            env_objs.append(f"{name} ({conf}%)")
        else:
            item_objs.append(f"{name} ({conf}%)")
    
    text_items = [t.get('DetectedText', '') for t in text.get('TextDetections', [])
                  if t.get('Type') == 'LINE' and t.get('Confidence', 0) > 70]
    
    prompt = f"""You assist a blind user. Describe only what is visible now, clearly and briefly (<=80 words).
Prioritize obstacles, people proximity, orientation cues, and readable text.
People: {', '.join([o.split('(')[0].strip() for o in people_objs]) if people_objs else 'None'}
Environment: {', '.join([o.split('(')[0].strip() for o in env_objs[:5]]) if env_objs else 'Unknown'}
Objects: {', '.join([o.split('(')[0].strip() for o in item_objs[:6]]) if item_objs else 'None'}
Text: {', '.join(text_items[:3]) if text_items else 'None'}
Format 2–3 sentences. Use spatial terms (left, right, ahead, near)."""
    
    if not bedrock:
        parts = []
        if env_objs:
            parts.append(f"Environment: {', '.join([o.split('(')[0].strip() for o in env_objs[:3]])}")
        if people_objs:
            parts.append(f"People: {', '.join([o.split('(')[0].strip() for o in people_objs[:2]])}")
        if item_objs:
            parts.append(f"Objects: {', '.join([o.split('(')[0].strip() for o in item_objs[:3]])}")
        return ". ".join(parts) if parts else "Scene detected"
    
    try:
        # Try Sonnet 4 first
        response = bedrock.invoke_model(
            modelId='anthropic.claude-sonnet-4-20250514',
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 300,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": img_b64
                            }
                        },
                        {"type": "text", "text": prompt}
                    ]
                }]
            })
        )
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]
        
    except Exception as sonnet_error:
        print(f"Sonnet 4 failed, falling back to Haiku: {sonnet_error}")
        try:
            response = bedrock.invoke_model(
                modelId='anthropic.claude-3-haiku-20240307-v1:0',
                body=json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 300,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": img_b64
                                }
                            },
                            {"type": "text", "text": prompt}
                        ]
                    }]
                })
            )
            result = json.loads(response["body"].read())
            return result["content"][0]["text"]
        except Exception as haiku_error:
            print(f"All Bedrock models failed: {haiku_error}")
            return f"Objects detected: {', '.join([l['Name'] for l in labels.get('Labels', [])[:5]])}"


def describe_scene_brief(labels):
    """Generate brief scene description for navigation mode"""
    objs = [l['Name'] for l in labels.get('Labels', [])[:5]]
    return f"Environment update: {', '.join(objs)}"


def cors_response(status_code, body):
    """Generate CORS-enabled response"""
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
            "Content-Type": "application/json"
        },
        "body": json.dumps(body)
    }