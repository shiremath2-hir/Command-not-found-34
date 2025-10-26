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


def handler(event, context):
    """Main Lambda handler with comprehensive error handling"""
    global last_desc, last_hash
    
    print(f"Received event: {json.dumps(event)}")
    
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
        tell = body.get('tell', False)
        user_lat = body.get('latitude')
        user_lng = body.get('longitude')
        dest_addr = body.get('destination_address')
        find_nearby = body.get('findNearby', False)
        get_route = body.get('getRoute', False)
        
        print(f"Parameters - tell: {tell}, lat: {user_lat}, lng: {user_lng}, dest: {dest_addr}")
        
        # Vision analysis
        labels = {}
        text = {'TextDetections': []}
        boxes = []
        alert = {"level": "none", "message": ""}
        
        if rekognition:
            try:
                print("Calling Rekognition detect_labels...")
                labels = rekognition.detect_labels(
                    Image={'Bytes': img_bytes},
                    MaxLabels=20,
                    MinConfidence=60
                )
                print(f"Labels detected: {len(labels.get('Labels', []))}")
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
        
        # AI narration
        ai_text = None
        if alert['level'] != 'none':
            ai_text = alert['message']
            print(f"Alert triggered: {ai_text}")
        elif tell:
            print("Generating AI description...")
            ai_text = describe_scene(labels, text, img_b64)
            last_desc, last_hash = ai_text, str(labels)
        elif last_hash == str(labels):
            ai_text = last_desc
        
        # Build response data
        data = {
            "aiDescription": ai_text,
            "alert": alert,
            "boundingBoxes": boxes,
            "shouldSpeak": bool(ai_text),
        }
        
        # Maps & routing
        if GOOGLE_MAPS_API_KEY and user_lat and user_lng:
            if dest_addr or find_nearby or get_route:
                print("Processing maps data...")
                try:
                    data["maps"] = handle_maps(
                        user_lat, user_lng, dest_addr, 
                        find_nearby, get_route, alert["level"]
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
    # Remove data URL prefix if present
    if 'base64,' in img_b64:
        img_b64 = img_b64.split('base64,')[1]
    
    # Remove whitespace
    img_b64 = img_b64.strip().replace('\n', '').replace('\r', '').replace(' ', '')
    
    # Decode
    img_bytes = base64.b64decode(img_b64)
    
    # Validate size
    if len(img_bytes) < 100:
        raise ValueError(f"Image data too small: {len(img_bytes)} bytes")
    
    # Check if it looks like valid image data (JPEG starts with FFD8, PNG with 89504E47)
    if not (img_bytes[:2] == b'\xff\xd8' or img_bytes[:4] == b'\x89PNG'):
        raise ValueError("Image data doesn't appear to be valid JPEG or PNG")
    
    return img_bytes


def handle_maps(lat, lng, dest_addr, find_nearby, get_route, alert_level):
    """Handle all maps-related operations"""
    m = {"location": {"latitude": lat, "longitude": lng}}
    
    try:
        # Import requests here to handle import errors gracefully
        import requests
        
        # Reverse geocode current location
        try:
            addr = reverse_geocode(lat, lng, requests)
            if addr:
                m["location"]["address"] = addr
        except Exception as e:
            print(f"Reverse geocode error: {e}")
        
        # Geocode destination
        dest_lat, dest_lng = None, None
        if dest_addr:
            try:
                geo = geocode(dest_addr, requests)
                if geo:
                    dest_lat, dest_lng = geo
            except Exception as e:
                print(f"Geocode error: {e}")
        
        # Find nearby places
        if find_nearby or alert_level != 'none':
            try:
                m["nearby"] = {
                    "hospitals": nearby(lat, lng, "hospital", requests),
                    "police": nearby(lat, lng, "police", requests),
                    "transit": nearby(lat, lng, "transit_station", requests),
                }
            except Exception as e:
                print(f"Nearby search error: {e}")
        
        # Get route directions
        if get_route and dest_lat and dest_lng:
            try:
                route = directions(lat, lng, dest_lat, dest_lng, requests)
                if route:
                    m["route"] = route
            except Exception as e:
                print(f"Directions error: {e}")
        
        # Emergency route for warnings
        if alert_level == "warning" and m.get("nearby", {}).get("hospitals"):
            try:
                h = m["nearby"]["hospitals"][0]
                r = directions(lat, lng, h["location"]["lat"], h["location"]["lng"], requests)
                if r:
                    m["emergency_route"] = {"destination": h["name"], "directions": r}
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
            for p in r.json().get("results", [])[:3]:
                loc = p["geometry"]["location"]
                out.append({
                    "name": p["name"],
                    "address": p.get("vicinity"),
                    "rating": p.get("rating"),
                    "open_now": p.get("opening_hours", {}).get("open_now"),
                    "location": loc,
                    "distance": dist(lat, lng, loc["lat"], loc["lng"])
                })
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
                steps.append({
                    "instruction": txt,
                    "distance": s["distance"]["text"],
                    "duration": s["duration"]["text"]
                })
            return {
                "total_distance": leg["distance"]["text"],
                "total_duration": leg["duration"]["text"],
                "steps": steps,
                "start_address": leg.get("start_address"),
                "end_address": leg.get("end_address")
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
    R = 6371000  # Earth radius in meters
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


def detect_pedestrian_alert(boxes):
    """Detect if pedestrian is in path"""
    try:
        people = [b for b in boxes 
                 if b["label"].lower() in ("person", "people", "human")]
        if not people:
            return {"level": "none", "message": ""}
        
        bx = people[0]["box"]
        size = bx["height"]
        center = bx["left"] + bx["width"] / 2
        
        if 0.35 <= center <= 0.65 and size > 0.25:
            if size < 0.35:
                msg = "Warning: pedestrian ahead"
            else:
                msg = "Alert: very close pedestrian ahead"
            return {"level": "warning", "message": msg}
    except Exception as e:
        print(f"Error detecting pedestrian: {e}")
    
    return {"level": "none", "message": ""}


def describe_scene(labels, text, img_b64):
    """Generate AI description of scene"""
    objs = [l["Name"] for l in labels.get("Labels", [])[:8]]
    
    if not bedrock:
        return f"Objects detected: {', '.join(objs[:5])}"
    
    prompt = (
        f"Describe scene briefly for blind user. "
        f"Focus on obstacles and direction cues. "
        f"Objects: {', '.join(objs)}"
    )
    
    try:
        response = bedrock.invoke_model(
            modelId='anthropic.claude-3-haiku-20240307-v1:0',
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 150,
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
    except Exception as e:
        print(f"Bedrock error: {e}")
        return f"Objects: {', '.join(objs[:5])}"


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