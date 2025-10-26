"""
Blind Navigation Client Application
Real-time navigation with voice guidance and obstacle detection
"""

#import cv2
import requests
import base64
import json
#import threading
import time
from io import BytesIO
import speech_recognition as sr
import pyttsx3
import numpy as np

try:
    import pygame
    pygame.mixer.init()
    PYGAME_AVAILABLE = True
except ImportError:
    PYGAME_AVAILABLE = False
    print("⚠️ pygame not available. Using pyttsx3 only for audio.")

class BlindNavigationClient:
    def __init__(self, api_url, graphhopper_key=None):
        self.api_url = api_url
        self.graphhopper_key = graphhopper_key
        
        # Initialize components
        self.camera = None
        self.tts_engine = pyttsx3.init()
        self.recognizer = sr.Recognizer()
        
        # Configure TTS
        self.tts_engine.setProperty('rate', 150)  # Speed
        self.tts_engine.setProperty('volume', 1.0)  # Volume
        
        # State
        self.current_route = None
        self.current_location = None
        self.is_navigating = False
        self.obstacle_detection_active = False
        self.running = True
        
        print("🎯 Blind Navigation System Initialized")
        self.speak("Blind Navigation System ready. Say help for available commands.")
    
    def speak(self, text):
        """Speak text using local TTS"""
        print(f"🔊 Speaking: {text}")
        try:
            self.tts_engine.say(text)
            self.tts_engine.runAndWait()
        except Exception as e:
            print(f"TTS Error: {e}")
    
    def play_audio_from_base64(self, audio_base64):
        """Play audio from base64 encoded MP3"""
        if not audio_base64:
            return
        
        try:
            if PYGAME_AVAILABLE:
                audio_bytes = base64.b64decode(audio_base64)
                audio_file = BytesIO(audio_bytes)
                pygame.mixer.music.load(audio_file, 'mp3')
                pygame.mixer.music.play()
                while pygame.mixer.music.get_busy():
                    time.sleep(0.1)
            else:
                print("⚠️ Audio playback not available")
        except Exception as e:
            print(f"Audio playback error: {e}")
    
    def listen_for_command(self):
        """Listen for voice command from user"""
        try:
            with sr.Microphone() as source:
                print("🎤 Listening for command...")
                self.speak("Listening")
                self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
                audio = self.recognizer.listen(source, timeout=5)
                
                command = self.recognizer.recognize_google(audio)
                print(f"📝 Heard: {command}")
                return command.lower()
        except sr.WaitTimeoutError:
            print("⏱️ Listening timeout")
            return None
        except sr.UnknownValueError:
            print("❓ Could not understand audio")
            self.speak("I didn't understand that. Please try again.")
            return None
        except Exception as e:
            print(f"Error listening: {e}")
            return None
    
    def start_navigation(self, start_location, end_location):
        """Start navigation from start to end location"""
        self.speak(f"Calculating route from {start_location} to {end_location}")
        
        try:
            # Call API to get route
            payload = {
                'action': 'get_route',
                'start_name': start_location,
                'end_name': end_location,
                'mode': 'foot',
                'graphhopper_key': self.graphhopper_key,
                'voice_id': 'Matthew'
            }
            
            response = requests.post(self.api_url, json=payload, timeout=30)
            data = response.json()
            
            if not data.get('success'):
                error_msg = data.get('error', 'Route calculation failed')
                self.speak(error_msg)
                return False
            
            # Parse response
            body = json.loads(data['body']) if isinstance(data['body'], str) else data['body']
            self.current_route = body['route']
            
            # Announce route summary
            summary = f"Route found. Total distance: {body['route']['distance_km']} kilometers. Estimated time: {body['route']['duration_minutes']} minutes. You will receive {body['total_warnings']} warnings along the way."
            self.speak(summary)
            
            # Play audio instructions if available
            if body.get('audio_instructions'):
                for audio_inst in body['audio_instructions']:
                    print(f"Step {audio_inst['step']}: {audio_inst['text']}")
                    self.play_audio_from_base64(audio_inst['audio'])
                    time.sleep(1)
            
            self.is_navigating = True
            return True
            
        except requests.exceptions.Timeout:
            self.speak("Request timeout. Please check your internet connection.")
            return False
        except Exception as e:
            print(f"Navigation error: {e}")
            self.speak(f"Navigation error: {str(e)}")
            return False
    
    def detect_obstacles(self):
        """Detect obstacles using camera"""
        if self.camera is None:
            self.camera = cv2.VideoCapture(0)
            if not self.camera.isOpened():
                self.speak("Cannot access camera")
                return None
        
        # Capture frame
        ret, frame = self.camera.read()
        if not ret:
            self.speak("Failed to capture image")
            return None
        
        # Encode to base64
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        image_base64 = base64.b64encode(buffer).decode('utf-8')
        
        try:
            # Send to API
            payload = {
                'action': 'detect_obstacles',
                'image': image_base64,
                'location': self.current_location
            }
            
            response = requests.post(self.api_url, json=payload, timeout=10)
            data = response.json()
            
            if data.get('success'):
                body = json.loads(data['body']) if isinstance(data['body'], str) else data['body']
                
                # Play warning audio
                if body.get('audio_warning'):
                    self.play_audio_from_base64(body['audio_warning'])
                
                # Display on frame for debugging
                danger_level = body.get('danger_level', 0)
                cv2.putText(frame, f"Danger: {danger_level}/10", (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                
                if body.get('immediate_action'):
                    cv2.putText(frame, body['immediate_action'], (10, 70), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)
                
                cv2.imshow('Obstacle Detection', frame)
                cv2.waitKey(1)
                
                return body
            
        except Exception as e:
            print(f"Obstacle detection error: {e}")
            return None
    
    def continuous_obstacle_monitoring(self):
        """Continuously monitor for obstacles"""
        print("🚨 Starting continuous obstacle monitoring...")
        self.obstacle_detection_active = True
        
        while self.obstacle_detection_active and self.running:
            result = self.detect_obstacles()
            if result and result.get('danger_level', 0) > 5:
                # High danger - immediate warning
                self.speak(result['immediate_action'])
            
            time.sleep(2)  # Check every 2 seconds
        
        if self.camera:
            self.camera.release()
            cv2.destroyAllWindows()
    
    def describe_surroundings(self):
        """Describe current surroundings"""
        self.speak("Analyzing surroundings")
        
        if self.camera is None:
            self.camera = cv2.VideoCapture(0)
        
        ret, frame = self.camera.read()
        if not ret:
            self.speak("Cannot capture image")
            return
        
        # Encode image
        _, buffer = cv2.imencode('.jpg', frame)
        image_base64 = base64.b64encode(buffer).decode('utf-8')
        
        try:
            payload = {
                'action': 'describe_surroundings',
                'image': image_base64,
                'location': self.current_location
            }
            
            response = requests.post(self.api_url, json=payload, timeout=15)
            data = response.json()
            
            if data.get('success'):
                body = json.loads(data['body']) if isinstance(data['body'], str) else data['body']
                
                # Speak description
                self.speak(body['description'])
                
                # Play audio if available
                if body.get('audio'):
                    self.play_audio_from_base64(body['audio'])
        
        except Exception as e:
            print(f"Scene description error: {e}")
            self.speak("Failed to analyze surroundings")
    
    def emergency_alert(self, emergency_type='general'):
        """Send emergency alert"""
        self.speak("Sending emergency alert")
        
        try:
            payload = {
                'action': 'emergency_alert',
                'location': self.current_location or [37.7749, -122.4194],  # Default to SF
                'type': emergency_type,
                'user_id': 'user123'  # Should be actual user ID
            }
            
            response = requests.post(self.api_url, json=payload, timeout=10)
            data = response.json()
            
            if data.get('success'):
                body = json.loads(data['body']) if isinstance(data['body'], str) else data['body']
                self.speak(body['message'])
                if body.get('audio'):
                    self.play_audio_from_base64(body['audio'])
        
        except Exception as e:
            print(f"Emergency alert error: {e}")
            self.speak("Failed to send emergency alert")
    
    def process_voice_command(self, command):
        """Process voice command"""
        if not command:
            return
        
        command = command.lower()
        
        if 'help' in command:
            help_text = "Available commands: navigate to location, where am I, describe surroundings, detect obstacles, emergency, stop navigation, quit"
            self.speak(help_text)
        
        elif 'navigate' in command or 'go to' in command:
            # Extract destination
            self.speak("What is your destination?")
            destination = self.listen_for_command()
            if destination:
                self.start_navigation("Current Location", destination)
        
        elif 'where am i' in command or 'location' in command:
            if self.current_location:
                self.speak(f"Your coordinates are {self.current_location[0]}, {self.current_location[1]}")
            else:
                self.speak("Location not available")
        
        elif 'describe' in command or 'what do you see' in command:
            self.describe_surroundings()
        
        elif 'detect' in command or 'obstacles' in command:
            self.speak("Starting obstacle detection")
            self.detect_obstacles()
        
        elif 'emergency' in command or 'help me' in command:
            self.emergency_alert('general')
        
        elif 'stop' in command:
            self.is_navigating = False
            self.obstacle_detection_active = False
            self.speak("Navigation stopped")
        
        elif 'quit' in command or 'exit' in command:
            self.speak("Shutting down")
            self.running = False
        
        else:
            self.speak("Command not recognized. Say help for available commands.")
    
    def run(self):
        """Main application loop"""
        self.speak("System ready. Say a command or say help for instructions.")
        
        while self.running:
            try:
                command = self.listen_for_command()
                if command:
                    self.process_voice_command(command)
                
                time.sleep(0.5)
            
            except KeyboardInterrupt:
                print("\n⚠️ Interrupted by user")
                break
            except Exception as e:
                print(f"Error in main loop: {e}")
                time.sleep(1)
        
        # Cleanup
        if self.camera:
            self.camera.release()
        cv2.destroyAllWindows()
        self.speak("Goodbye")
        print("👋 Application closed")


# ========== MAIN EXECUTION ==========

if __name__ == "__main__":
    # Configuration
    API_URL = "https://c3hcqo9h7b.execute-api.us-east-1.amazonaws.com/dev/navigation"
    GRAPHHOPPER_KEY = "f0c161ef-891e-4428-9b98-c0da7de3fe25"
    
    print("=" * 50)
    print("🎯 BLIND NAVIGATION SYSTEM")
    print("=" * 50)
    
    # Initialize client
    client = BlindNavigationClient(API_URL, GRAPHHOPPER_KEY)
    
    # Option 1: Voice command mode
    print("\n🎤 Voice Command Mode - Say 'help' for commands")
    client.run()
    
    # Option 2: Manual testing mode
    # Uncomment below for manual testing:
    """
    print("\n🧪 Manual Testing Mode")
    
    # Test navigation
    print("\n1. Testing Navigation...")
    client.start_navigation("San Francisco", "Golden Gate Bridge")
    
    time.sleep(2)
    
    # Test obstacle detection
    print("\n2. Testing Obstacle Detection...")
    result = client.detect_obstacles()
    print(f"Obstacles detected: {result}")
    
    time.sleep(2)
    
    # Test scene description
    print("\n3. Testing Scene Description...")
    client.describe_surroundings()
    
    time.sleep(2)
    
    # Test emergency
    print("\n4. Testing Emergency Alert...")
    # client.emergency_alert('test')  # Uncomment to test
    
    print("\n✅ All tests completed")
    """