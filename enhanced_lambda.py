import json
import boto3
import base64
from io import BytesIO

rekognition = boto3.client('rekognition')

def handler(event, context):
    print('received event:', event)
    
    try:
        # Parse the incoming request
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        
        # Get base64 image from request
        image_base64 = body.get('image')
        
        if not image_base64:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
                },
                'body': json.dumps({'error': 'No image provided'})
            }
        
        # Remove data URL prefix if present
        if 'base64,' in image_base64:
            image_base64 = image_base64.split('base64,')[1]
        
        # Decode base64 image
        image_bytes = base64.b64decode(image_base64)
        
        # Detect labels (objects, scenes, concepts)
        labels_response = rekognition.detect_labels(
            Image={'Bytes': image_bytes},
            MaxLabels=10,
            MinConfidence=70
        )
        
        # Detect text in image
        text_response = rekognition.detect_text(
            Image={'Bytes': image_bytes}
        )
        
        # Format response for accessibility
        description = generate_accessibility_description(labels_response, text_response)
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
            },
            'body': json.dumps({
                'description': description,
                'labels': labels_response['Labels'],
                'text': text_response.get('TextDetections', [])
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
            },
            'body': json.dumps({'error': str(e)})
        }

def generate_accessibility_description(labels_response, text_response):
    """Generate human-readable description for blind users with directional guidance"""

    description_parts = []

    # Priority hazards to announce first
    hazards = ['Car', 'Vehicle', 'Truck', 'Bus', 'Motorcycle', 'Bicycle', 'Stairs', 'Staircase']

    # Check for hazards first
    hazard_labels = [label for label in labels_response['Labels']
                     if label['Name'] in hazards and label['Confidence'] > 75]

    if hazard_labels:
        hazard_names = [label['Name'] for label in hazard_labels]
        description_parts.append(f"CAUTION: {', '.join(hazard_names)} detected")

    # Main objects with directional info
    if labels_response['Labels']:
        objects_with_position = []
        for label in labels_response['Labels'][:5]:
            # Get position if available
            if label.get('Instances') and len(label['Instances']) > 0:
                # Use first instance's bounding box
                bbox = label['Instances'][0]['BoundingBox']
                center_x = bbox['Left'] + bbox['Width'] / 2

                # Determine direction
                if center_x < 0.33:
                    position = "on your left"
                elif center_x > 0.66:
                    position = "on your right"
                else:
                    position = "ahead"

                objects_with_position.append(f"{label['Name']} {position}")
            else:
                objects_with_position.append(label['Name'])

        if objects_with_position:
            description_parts.append(f"I see: {', '.join(objects_with_position[:3])}")

    # Text detected (signs, labels)
    text_items = [t['DetectedText'] for t in text_response.get('TextDetections', [])
                  if t['Type'] == 'LINE' and len(t['DetectedText'].strip()) > 2]
    if text_items:
        text_preview = text_items[:2]  # Limit to 2 text items to avoid overwhelming
        description_parts.append(f"Text visible: {', '.join(text_preview)}")

    # People count
    people_count = sum(1 for label in labels_response['Labels']
                       if label['Name'] == 'Person' and label['Confidence'] > 80)
    if people_count > 0:
        if people_count == 1:
            description_parts.append("1 person nearby")
        else:
            description_parts.append(f"{people_count} people nearby")

    return '. '.join(description_parts) if description_parts else "Path appears clear, no obstacles detected."