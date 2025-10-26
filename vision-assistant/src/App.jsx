import React, { useState, useEffect, useRef } from 'react';
import { Navigation, MapPin, AlertTriangle, Camera, Eye, Phone, Mic, Volume2, VideoOff, Video, Loader } from 'lucide-react';
import VoiceController from './components/Voicecontroller';
import { CameraView, NavigationMode, VisionMode } from './components/UIComponents';
import 'dotenv/config'; // or require('dotenv').config();

const API_ENDPOINT = process.env.API_ENDPOINT;
//const API_ENDPOINT = 'https://c3hcqo9h7b.execute-api.us-east-1.amazonaws.com/dev/items';

export default function App() {
  // --- Your state and refs (unchanged) ---
  const [mode, setMode] = useState('navigation');
  const [isNavigating, setIsNavigating] = useState(false);
  const [destination, setDestination] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentInstruction, setCurrentInstruction] = useState('');
  const [distanceRemaining, setDistanceRemaining] = useState('');
  const [alert, setAlert] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const navigationIntervalRef = useRef(null);
  const obstacleCheckIntervalRef = useRef(null);
  const lastSpokenRef = useRef('');
  const speechSynthesisRef = useRef(window.speechSynthesis);
  const lastInstructionRef = useRef('');
   const lastDistanceRef = useRef(null);

  const speak = (text, interrupt = false) => {
    if (!text || text === lastSpokenRef.current) return;
    if (interrupt) speechSynthesisRef.current.cancel();
    lastSpokenRef.current = text;
    setTimeout(() => { lastSpokenRef.current = ''; }, 5000);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    speechSynthesisRef.current.speak(utterance);
    console.log('🔊 Speaking:', text);
  };

  useEffect(() => {
    let watchId;
    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed
          });
        },
        (error) => {
          console.error('Location error:', error);
          speak('Location access denied');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
    return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, []);

  const startCamera = async () => {
    try {
      console.log('🎥 Starting camera with react-camera-pro...');
      setShowCamera(true);
      speak('Camera activated');
    } catch (err) {
      console.error('Camera error:', err);
      speak('Camera access denied');
    }
  };

  const stopCamera = () => {
    console.log('📷 Stopping camera...');
    setShowCamera(false);
    speak('Camera stopped');
  };

  const captureAndAnalyze = async (isObstacleCheck = false) => {
    if (!videoRef.current) {
      speak('Camera not ready');
      return;
    }

    try {
      setProcessing(true);
      speak('Analyzing scene');

      const imageData = videoRef.current.takePhoto();
      const base64Image = imageData.split(',')[1];

      const payload = {
        image: base64Image,
        continuous: isObstacleCheck,
        tell: !isObstacleCheck,
        warnOnly: isObstacleCheck,
        latitude: currentLocation?.lat,
        longitude: currentLocation?.lng,
        navigationMode: isNavigating
      };

      console.log('📤 Sending to API:', API_ENDPOINT);
      
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('📥 API Response:', data);

      if (data.alert && data.alert.level !== 'none') {
        setAlert(data.alert);
        if (data.shouldSpeak) {
          speak(data.alert.message, true);
        }
      } else {
        setAlert(null);
      }

      if (data.aiDescription && data.shouldSpeak) {
        speak(data.aiDescription, true);
      }

      if (data.maps?.navigation && isNavigating) {
        setCurrentInstruction(data.maps.navigation.next_instruction);
        setDistanceRemaining(data.maps.navigation.total_remaining);
      }

      if (data.maps?.nearby) {
        setNearbyPlaces(data.maps.nearby);
      }

      console.log('🎯 Vision Analysis Results:', {
        aiDescription: data.aiDescription,
        alert: data.alert,
        shouldSpeak: data.shouldSpeak,
        boundingBoxes: data.boundingBoxes?.length || 0,
        sceneChanged: data.sceneChanged
      });

    } catch (err) {
      console.error('❌ Analysis error:', err);
      speak('Failed to analyze scene. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const startObstacleDetection = () => {
    if (obstacleCheckIntervalRef.current) {
      clearInterval(obstacleCheckIntervalRef.current);
    }
    obstacleCheckIntervalRef.current = setInterval(() => {
      captureAndAnalyze(true);
    }, 3000);
    console.log('🚧 Obstacle detection started');
  };

  const stopObstacleDetection = () => {
    if (obstacleCheckIntervalRef.current) {
      clearInterval(obstacleCheckIntervalRef.current);
      obstacleCheckIntervalRef.current = null;
    }
    console.log('🚧 Obstacle detection stopped');
  };

  const startNavigation = async () => {
    if (!destination.trim()) {
      speak('Please enter destination');
      return;
    }

    speak('Starting navigation to ' + destination);
    setIsNavigating(true);
    console.log("isNavigating", isNavigating);
    if (!showCamera) await startCamera();
    console.log("camera started");
    
    startRealTimeNavigation();
    startObstacleDetection();
  };

  const startRealTimeNavigation = () => {
    console.log("starting real time navigation");
    if (navigationIntervalRef.current) {
      clearInterval(navigationIntervalRef.current);
    }
    updateNavigationGuidance();
    navigationIntervalRef.current = setInterval(() => {
      updateNavigationGuidance();
    }, 3000);
  };

  const updateNavigationGuidance = async () => {
    console.log("hiiii",isNavigating, currentLocation, destination);
    if (!currentLocation || !destination) return;
    
    try {
      let imageData = '';
      if (showCamera && videoRef.current) {
        try {
          imageData = videoRef.current.takePhoto();
          console.log("imageData", imageData);
          if (imageData) {
            imageData = imageData.split(',')[1];
          }
        } catch (err) {
          console.log('Camera capture skipped:', err);
        }
      }

      const payload = {
        image: imageData,
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        destination_address: destination,
        navigationMode: true,
        getRoute: true,
        navigationMode: true,     // ✅ add this
        findNearby: true, 
        continuous: true
      };

      console.log("sending payload to API:", payload);

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log("response from API:", response);

      if (response.ok) {
        const data = await response.json();
        // in updateNavigationGuidance, after parsing JSON:
        console.log('API maps:', data.maps);

        if (data.maps?.navigation) {
          const nav = data.maps.navigation;
          
          setCurrentInstruction(nav.next_instruction);
          setDistanceRemaining(nav.total_remaining);
          
          const instructionChanged = nav.next_instruction !== lastInstructionRef.current;
          const currentDistance = parseDistanceToMeters(nav.distance_to_next || '0');
          let shouldSpeak = instructionChanged;
          if (lastDistanceRef.current !== null) {
            const lastDist = lastDistanceRef.current;
            if ((lastDist > 200 && currentDistance <= 200) ||
                (lastDist > 100 && currentDistance <= 100) ||
                (lastDist > 50 && currentDistance <= 50) ||
                (lastDist > 20 && currentDistance <= 20)) {
              shouldSpeak = true;
            }
          }
          lastDistanceRef.current = currentDistance;
          lastInstructionRef.current = nav.next_instruction;
          
          if (shouldSpeak) {
            const voiceGuidance = generateContextualGuidance(nav, currentLocation);
            speak(voiceGuidance, instructionChanged);
            console.log('🔊 Voice guidance:', voiceGuidance);
          }
          
          console.log('🧭 Navigation update:', {
            instruction: nav.next_instruction,
            distance: nav.distance_to_next,
            remaining: nav.total_remaining,
            maneuver: nav.maneuver,
            spoke: shouldSpeak
          });
        }
        if (data.maps?.navigation) {
          const nav = data.maps.navigation;
          const nextDistance = parseDistanceToMeters(nav.distance_to_next || '0');
          const totalRemaining = parseDistanceToMeters(nav.total_remaining || '0');
          
          console.log('🎯 Distance check:', {
            distance_to_next: nav.distance_to_next,
            nextDistance,
            total_remaining: nav.total_remaining,
            totalRemaining,
            willTriggerArrival: totalRemaining < 20
          });
          
          if (totalRemaining < 20 || (nextDistance < 10 && nav.next_instruction?.toLowerCase().includes('destination'))) {
            speak('You have arrived at your destination!', true);
            stopNavigation();
          }
        }
        
      }
    } catch (err) {
      console.error('Navigation update error:', err);
    }
  };

  const parseDistanceToMeters = (distanceText) => {
    if (!distanceText) return 999999;
    
    // Remove any commas and trim
    const cleanText = distanceText.toString().replace(/,/g, '').trim();
    
    const match = cleanText.match(/(\d+\.?\d*)\s*(m|km|ft|mi|miles?|meters?|feet|kilometers?)/i);
    if (!match) {
      console.warn('⚠️ Failed to parse distance:', distanceText);
      return 999999;
    }
    
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    let meters;
    if (unit.startsWith('km') || unit === 'kilometers') {
      meters = value * 1000;
    } else if (unit.startsWith('mi') || unit === 'miles') {
      meters = value * 1609.34;
    } else if (unit.startsWith('ft') || unit === 'feet') {
      meters = value * 0.3048;
    } else {
      meters = value;
    }
    
    console.log(`📏 Parsed "${distanceText}" → ${meters.toFixed(2)}m (${value} ${unit})`);
    return meters;
  };
 
  // NOTE: Kept as-is to respect "don't change any of my code"
  const generateVoiceGuidance = (navData) => {
    let guidance = '';
    const distance = navData.distance_to_next || navData.distance_meters || '';
    const instruction = navData.next_instruction || '';
    if (distance && instruction) {
      let distanceText = '';
      if (typeof distance === 'number') {
        if (distance < 50) {
          distanceText = 'in about 50 meters';
        } else if (distance < 100) {
          distanceText = `in about ${distance} meters`;
        } else if (distance < 1000) {
          distanceText = `in ${distance} meters`;
        } else {
          distanceText = `in ${(distance/1000).toFixed(1)} kilometers`;
        }
      } else {
        distanceText = distance;
      }
      guidance = `${instruction} ${distanceText}`;
    } else if (instruction) {
      guidance = instruction;
    } else {
      guidance = 'Continue following the route';
    }
    return guidance;
  };

  const generateContextualGuidance = (navData, location) => {
    const distance = navData.distance_to_next || '';
    const instruction = navData.next_instruction || '';
    
    if (distance && instruction) {
      return `${instruction}, ${distance}`;
    } else if (instruction) {
      return instruction;
    }
    return 'Continue on route';
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setCurrentInstruction('');
    setDistanceRemaining('');
    if (navigationIntervalRef.current) {
      clearInterval(navigationIntervalRef.current);
      navigationIntervalRef.current = null;
    }
    stopObstacleDetection();
    speak('Navigation stopped');
  };

  const findNearby = async () => {
    if (!currentLocation) {
      speak('Waiting for GPS');
      return;
    }
    
    speak('Searching emergency locations');
    setProcessing(true);
    
    try {
      const payload = {
        image: canvasRef.current?.toDataURL('image/jpeg', 0.5) || '',
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        findNearby: true
      };

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.maps?.nearby) {
          setNearbyPlaces(data.maps.nearby);
          if (data.maps.nearby.hospitals?.[0]) {
            const h = data.maps.nearby.hospitals[0];
            speak(`Nearest hospital is ${h.name}, ${Math.round(h.distance)} meters away`);
          }
        }
      }
    } catch (err) {
      console.error('Find nearby error:', err);
      speak('Failed to find nearby locations');
    } finally {
      setProcessing(false);
    }
  };

  const describeScene = async () => {
    if (!showCamera) {
      await startCamera();
      setTimeout(() => speak('Camera ready. Tap describe again'), 1500);
      return;
    }
    await captureAndAnalyze(false);
  };

  const speakCurrentLocation = async () => {
    if (!currentLocation) {
      speak('Location not available');
      return;
    }

    try {
      const payload = {
        image: canvasRef.current?.toDataURL('image/jpeg', 0.5) || '',
        latitude: currentLocation.lat,
        longitude: currentLocation.lng
      };

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.maps?.location?.address) {
          speak(`You are at ${data.maps.location.address}`);
          return;
        }
      }
    } catch (err) {
      console.error('Location speak error:', err);
    }
    
    speak(`Coordinates ${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`);
  };

  const handleVoiceCommand = (command) => {
    console.log('Voice command:', command);
    if (command.includes('describe') || command.includes('see')) describeScene();
    else if (command.includes('navigate to') || command.includes('go to')) {
      const dest = command.split(/navigate to |go to /)[1];
      if (dest) { setDestination(dest); setTimeout(startNavigation, 500); }
    }
    else if (command.includes('start navigation')) startNavigation();
    else if (command.includes('stop')) isNavigating ? stopNavigation() : speak('Navigation not active');
    else if (command.includes('repeat')) currentInstruction ? speak(currentInstruction) : speak('No instruction');
    else if (command.includes('emergency') || command.includes('hospital')) findNearby();
    else if (command.includes('where am i')) speakCurrentLocation();
    else if (command.includes('help')) speak('Say: describe, navigate to address, stop, emergency, or where am I');
    else speak('Command not recognized');
  };

  // -------------------- UI --------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700 p-4">
      <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden">
        <VoiceController isListening={isListening} onToggle={setIsListening} onCommand={handleVoiceCommand} />
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 text-center">
          <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-3">
            <Eye className="w-8 h-8" />Vision Assistant
          </h1>
          <p className="text-base opacity-90">AI Navigation for the Blind</p>
          <button onClick={() => { const newState = !isListening; setIsListening(newState); speak(newState ? 'Voice enabled' : 'Voice disabled'); }} className={`mt-4 px-6 py-2 rounded-full font-semibold transition-all ${isListening ? 'bg-red-500 animate-pulse' : 'bg-white bg-opacity-20 hover:bg-opacity-30'}`}>
            {isListening ? <><Mic className="inline w-5 h-5 mr-2" />Listening...</> : <><Volume2 className="inline w-5 h-5 mr-2" />Enable Voice</>}
          </button>
        </div>
        <div className="p-6">
          <div className="flex justify-center gap-4 mb-6">
            <button onClick={() => { setMode('navigation'); speak('Navigation mode'); }} className={`px-6 py-3 rounded-full font-semibold transition-all ${mode === 'navigation' ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg' : 'bg-gray-200 text-gray-700'}`}>
              <Navigation className="inline w-5 h-5 mr-2" />Navigation
            </button>
            <button onClick={() => { setMode('vision'); speak('Vision mode'); }} className={`px-6 py-3 rounded-full font-semibold transition-all ${mode === 'vision' ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg' : 'bg-gray-200 text-gray-700'}`}>
              <Camera className="inline w-5 h-5 mr-2" />Vision
            </button>
          </div>
          <CameraView showCamera={showCamera} videoRef={videoRef} alert={alert} processing={processing} />
          {mode === 'navigation' && (
            <NavigationMode
              isNavigating={isNavigating}
              destination={destination}
              setDestination={setDestination}
              currentLocation={currentLocation}
              currentInstruction={currentInstruction}
              distanceRemaining={distanceRemaining}
              alert={alert}
              nearbyPlaces={nearbyPlaces}
              onStartNavigation={startNavigation}
              onStopNavigation={stopNavigation}
              onFindNearby={findNearby}
              onSpeakLocation={speakCurrentLocation}
              onRepeatInstruction={() => currentInstruction && speak(currentInstruction)}
            />
          )}
          {mode === 'vision' && (
            <VisionMode
              showCamera={showCamera}
              currentLocation={currentLocation}
              onDescribeScene={describeScene}
              onToggleCamera={showCamera ? stopCamera : startCamera}
              onSpeakLocation={speakCurrentLocation}
              speak={speak}
              processing={processing}
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
          {isListening && (
            <div className="mt-6 bg-blue-50 border-2 border-blue-300 p-4 rounded-xl">
              <h4 className="font-bold text-blue-800 mb-2">🎤 Voice Commands:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• "Describe scene"</li>
                <li>• "Navigate to [address]"</li>
                <li>• "Stop"</li>
                <li>• "Emergency"</li>
                <li>• "Where am I?"</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}