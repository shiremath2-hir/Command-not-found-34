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
    """Generate human-readable description for blind users"""
    
    description_parts = []
    
    # Main objects detected
    if labels_response['Labels']:
        top_labels = [label['Name'] for label in labels_response['Labels'][:3]]
        description_parts.append(f"I see: {', '.join(top_labels)}")
    
    # Text detected
    text_items = [t['DetectedText'] for t in text_response.get('TextDetections', []) 
                  if t['Type'] == 'LINE']
    if text_items:
        description_parts.append(f"Text found: {'. '.join(text_items[:3])}")
    
    return '. '.join(description_parts) if description_parts else "Unable to detect clear objects in this image."