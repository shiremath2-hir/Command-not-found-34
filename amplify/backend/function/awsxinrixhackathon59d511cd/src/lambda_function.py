"""
Main AWS Lambda handler
- Parses the API Gateway event.
- Decodes the base64 image.
- Orchestrates calls to the Rekognition service and formatter.
- Returns a valid HTTP response.
"""
import json
import base64
import rekognition_service  # Import our new service
import accessibility_formatter  # Import our new formatter

def handler(event, context):
    print('received event:', event)
    
    try:
        # 1. Parse the incoming request
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        image_base64 = body.get('image')
        
        if not image_base64:
            print("Error: No image provided in request body.")
            return _build_response(400, {'error': 'No image provided'})

        # 2. Decode the image
        # Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        if 'base64,' in image_base64:
            image_base64 = image_base64.split('base64,')[1]
            
        image_bytes = base64.b64decode(image_base64)
        
        # 3. Delegate to services
        # Call the service to get raw data
        labels_response, text_response = rekognition_service.analyze_image(image_bytes)
        
        # Call the formatter to get the human-readable string
        description = accessibility_formatter.generate_description(labels_response, text_response)
        
        # 4. Build the success response
        response_data = {
            'description': description,
            'labels': labels_response.get('Labels', []),
            'text': text_response.get('TextDetections', [])
        }
        return _build_response(200, response_data)

    except base64.binascii.Error as e:
        # Specific error for bad base64
        print(f"Error decoding base64: {str(e)}")
        return _build_response(400, {'error': f'Invalid base64 encoding: {str(e)}'})
    except Exception as e:
        # General catch-all error
        print(f"Error: {str(e)}")
        return _build_response(500, {'error': str(e)})

def _build_response(status_code, body_dict):
    """Helper function to create a valid API Gateway proxy response."""
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
        'body': json.dumps(body_dict)
    }