import json
import boto3
import requests
from datetime import datetime
import traceback

# Initialize AWS clients
polly = boto3.client('polly')
location = boto3.client('location')

def lambda_handler(event, context):
    """
    Main Lambda handler for navigation requests
    """
    print("=== EVENT RECEIVED ===")
    print(json.dumps(event))

    try:
        # Parse the body (API Gateway sends event['body'] as a JSON string)
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event or {}

        action = body.get('action')

        if not action:
            return error_response("Missing 'action' parameter", 400)

        # Route based on action
        if action == 'get_route':
            return handle_get_route(body)
        elif action == 'speak':
            return handle_speak(body)
        elif action == 'get_transit':
            return handle_transit(body)
        elif action == 'detect_obstacles':
            return handle_obstacles(body)
        elif action == 'health':
            return {
                'statusCode': 200,
                'headers': cors_headers(),
                'body': json.dumps({
                    'status': 'healthy',
                    'timestamp': datetime.utcnow().isoformat(),
                    'version': '1.0'
                })
            }
        else:
            return error_response(f"Unknown action: {action}", 400)

    except Exception as e:
        # Log error to CloudWatch with full traceback
        print("=== Lambda Error ===")
        print(traceback.format_exc())

        return {
            'statusCode': 500,
            'headers': cors_headers(),
            'body': json.dumps({
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc(),
                'hint': "Check CloudWatch logs for details"
            })
        }


def handle_get_route(body):
    """
    Calculate route using GraphHopper API
    Accepts either coordinates or location names
    """
    try:
        start_coords = body.get('start_coords')
        end_coords = body.get('end_coords')
        start_name = body.get('start_name')
        end_name = body.get('end_name')
        mode = body.get('mode', 'foot')

        # If names are provided, geocode them
        if start_name:
            start_coords = geocode_location(start_name)
        if end_name:
            end_coords = geocode_location(end_name)

        if not start_coords or not end_coords:
            return error_response('Missing start or end coordinates', 400)

        # GraphHopper API call (same as before)
        url = "https://graphhopper.com/api/1/route"
        params = {
            'point': [
                f"{start_coords[0]},{start_coords[1]}",
                f"{end_coords[0]},{end_coords[1]}"
            ],
            'vehicle': mode,
            'locale': 'en',
            'instructions': 'true',
            'points_encoded': 'false',
            'elevation': 'true'
        }

        api_key = body.get('graphhopper_key')
        if api_key:
            params['key'] = api_key

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if 'paths' not in data or len(data['paths']) == 0:
            return error_response('No route found', 404)

        path = data['paths'][0]

        # Format instructions
        instructions = []
        for inst in path['instructions']:
            distance = inst['distance']
            if distance < 10:
                dist_text = 'immediately'
            elif distance < 1000:
                dist_text = f'in {int(distance)} meters'
            else:
                dist_text = f'in {distance/1000:.1f} kilometers'

            instructions.append({
                'text': inst['text'],
                'distance': distance,
                'distance_text': dist_text,
                'full_text': f"{inst['text']} {dist_text}"
            })

        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({
                'success': True,
                'distance': path['distance'],
                'distance_km': round(path['distance'] / 1000, 2),
                'duration': path['time'] / 1000,
                'duration_minutes': round(path['time'] / 60000),
                'instructions': instructions,
                'total_steps': len(instructions)
            })
        }

    except requests.exceptions.RequestException as e:
        return error_response(f'Route calculation failed: {str(e)}', 500)
    except Exception as e:
        return error_response(str(e), 500)

def handle_speak(body):
    """
    Convert text to speech using AWS Polly
    """
    try:
        text = body.get('text')
        voice_id = body.get('voice_id', 'Joanna')
        output_format = body.get('output_format', 'mp3')
        
        if not text:
            return error_response('Missing text parameter', 400)
        
        # Synthesize speech
        response = polly.synthesize_speech(
            Text=text,
            OutputFormat=output_format,
            VoiceId=voice_id,
            Engine='neural'
        )
        
        # Read audio stream
        audio_data = response['AudioStream'].read()
        
        # In production, upload to S3 and return URL
        # For now, return base64 encoded audio
        import base64
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({
                'success': True,
                'audio': audio_base64,
                'format': output_format,
                'text_length': len(text)
            })
        }
        
    except Exception as e:
        return error_response(str(e), 500)


def handle_transit(body):
    """
    Get public transit information
    Integration with INRIX or local transit APIs
    """
    try:
        stop_id = body.get('stop_id')
        route_id = body.get('route_id')
        location = body.get('location')  # [lat, lon]
        
        # TODO: Integrate with INRIX Transit API
        # For now, return mock data
        
        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({
                'success': True,
                'arrivals': [
                    {
                        'route': 'Bus 38',
                        'arrival_time': '5 minutes',
                        'destination': 'Downtown'
                    },
                    {
                        'route': 'Bus 22',
                        'arrival_time': '12 minutes',
                        'destination': 'Airport'
                    }
                ],
                'message': 'Next bus arrives in 5 minutes'
            })
        }
        
    except Exception as e:
        return error_response(str(e), 500)


def handle_obstacles(body):
    """
    Detect obstacles using AWS Rekognition
    """
    try:
        image_base64 = body.get('image')
        
        if not image_base64:
            return error_response('Missing image parameter', 400)
        
        # Decode base64 image
        import base64
        image_bytes = base64.b64decode(image_base64)
        
        # Use Rekognition to detect objects
        rekognition = boto3.client('rekognition')
        response = rekognition.detect_labels(
            Image={'Bytes': image_bytes},
            MaxLabels=10,
            MinConfidence=70
        )
        
        # Filter for obstacles
        danger_items = [
            'Car', 'Vehicle', 'Person', 'Bicycle', 'Motorcycle',
            'Tree', 'Pole', 'Barrier', 'Construction', 'Traffic Light',
            'Stop Sign', 'Stairs', 'Curb'
        ]
        
        obstacles = []
        for label in response['Labels']:
            if label['Name'] in danger_items:
                obstacles.append({
                    'name': label['Name'],
                    'confidence': round(label['Confidence'], 2)
                })
        
        # Generate warning message
        if obstacles:
            obstacle_names = [o['name'] for o in obstacles]
            warning = f"Warning! Detected: {', '.join(obstacle_names)} ahead"
        else:
            warning = "Path appears clear"
        
        return {
            'statusCode': 200,
            'headers': cors_headers(),
            'body': json.dumps({
                'success': True,
                'obstacles': obstacles,
                'warning': warning,
                'has_obstacles': len(obstacles) > 0
            })
        }
        
    except Exception as e:
        return error_response(str(e), 500)


def cors_headers():
    """
    CORS headers for API Gateway
    """
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }


def error_response(message, status_code=500):
    """
    Standard error response
    """
    return {
        'statusCode': status_code,
        'headers': cors_headers(),
        'body': json.dumps({
            'success': False,
            'error': message
        })
    }