import requests

# Test GraphHopper API directly
url = "https://graphhopper.com/api/1/route"
params = {
    'point': ['37.7749,-122.4194', '37.8199,-122.4783'],  # SF to Fisherman's Wharf
    'vehicle': 'foot',
    'locale': 'en',
    'instructions': 'true',
    'points_encoded': 'false',
    'key': 'f0c161ef-891e-4428-9b98-c0da7de3fe25'
}

response = requests.get(url, params=params, timeout=10)
print(f"Status: {response.status_code}")
print(f"Response: {response.text[:500]}")  # First 500 chars