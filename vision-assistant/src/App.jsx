import React, { useState, useEffect, useRef } from 'react';
import { Navigation, MapPin, AlertTriangle, Camera, Eye, Phone, Mic, Volume2, VideoOff, Video, Loader } from 'lucide-react';

const API_ENDPOINT = 'https://c3hcqo9h7b.execute-api.us-east-1.amazonaws.com/dev/items';

const VoiceController = ({ isListening, onToggle, onCommand }) => {
  const recognitionRef = useRef(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        const command = last[0].transcript.toLowerCase().trim();
        onCommand(command);
      };
      
      recognitionRef.current.onerror = () => onToggle(false);
      recognitionRef.current.onend = () => {
        if (isListening) {
          try { recognitionRef.current.start(); } catch (err) {}
        }
      };
    }
  }, [isListening, onCommand, onToggle]);

  useEffect(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      try { recognitionRef.current.start(); } catch (err) {}
    } else {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  return null;
};

const CameraView = ({ showCamera, videoRef, alert, processing }) => {
  if (!showCamera) return null;
  return (
    <div className="mb-4 relative">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-64 object-cover rounded-xl shadow-lg" />
      <div className="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
        <Video className="w-4 h-4" />LIVE
      </div>
      {processing && (
        <div className="absolute top-2 left-2 bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
          <Loader className="w-4 h-4 animate-spin" />Analyzing
        </div>
      )}
      {alert && alert.level !== 'none' && (
        <div className="absolute bottom-2 left-2 right-2 bg-red-600 text-white p-3 rounded-lg font-bold animate-pulse">
          ⚠️ {alert.message}
        </div>
      )}
    </div>
  );
};

const NavigationMode = ({ isNavigating, destination, setDestination, currentLocation, currentInstruction, distanceRemaining, alert, nearbyPlaces, onStartNavigation, onStopNavigation, onFindNearby, onSpeakLocation, onRepeatInstruction }) => {
  return (
    <div className="space-y-4">
      {!isNavigating && (
        <div className="bg-gray-50 p-6 rounded-xl">
          <label className="block text-lg font-semibold text-gray-700 mb-3">Where do you want to go?</label>
          <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Enter destination address" className="w-full px-4 py-3 text-lg border-2 border-indigo-300 rounded-lg focus:outline-none focus:border-indigo-500" onKeyPress={(e) => e.key === 'Enter' && onStartNavigation()} />
          <div className="flex gap-3 mt-4">
            <button onClick={onStartNavigation} disabled={!currentLocation} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transition-all disabled:opacity-50">
              <Navigation className="inline w-6 h-6 mr-2" />Start Navigation
            </button>
            <button onClick={onFindNearby} disabled={!currentLocation} className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transition-all disabled:opacity-50">
              <Phone className="inline w-6 h-6 mr-2" />Find Emergency
            </button>
          </div>
        </div>
      )}

      {isNavigating && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white p-6 rounded-xl shadow-lg">
            <h3 className="text-xl font-bold mb-3">Current Direction</h3>
            <p className="text-2xl font-semibold mb-2">{currentInstruction || 'Calculating route...'}</p>
            <p className="text-lg opacity-90">{distanceRemaining && `Distance: ${distanceRemaining}`}</p>
          </div>
          <button onClick={onStopNavigation} className="w-full bg-gradient-to-r from-red-500 to-pink-500 text-white px-6 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transition-all">Stop Navigation</button>
          <button onClick={onRepeatInstruction} disabled={!currentInstruction} className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50">🔊 Repeat</button>
        </div>
      )}

      {alert && alert.level !== 'none' && (
        <div className="bg-red-500 text-white p-5 rounded-xl shadow-lg animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8" />
            <div>
              <h4 className="font-bold text-lg">⚠️ Warning!</h4>
              <p className="text-lg">{alert.message}</p>
            </div>
          </div>
        </div>
      )}

      {currentLocation && (
        <div className="bg-gray-50 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-gray-700">
            <MapPin className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold">Current Location:</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}</p>
          <p className="text-xs text-gray-500 mt-1">Accuracy: ±{Math.round(currentLocation.accuracy)}m</p>
          <button onClick={onSpeakLocation} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold">🔊 Speak Location</button>
        </div>
      )}

      {!currentLocation && (
        <div className="bg-yellow-50 border-2 border-yellow-300 p-4 rounded-xl">
          <p className="text-yellow-800 font-semibold">⚠️ Waiting for GPS...</p>
        </div>
      )}

      {nearbyPlaces && (
        <div className="bg-gray-50 p-4 rounded-xl">
          <h3 className="font-bold text-lg text-gray-700 mb-3">Nearby Emergency</h3>
          {nearbyPlaces.hospitals && nearbyPlaces.hospitals.length > 0 && (
            <div className="mb-3">
              <h4 className="font-semibold text-red-600 mb-2">🏥 Hospitals</h4>
              {nearbyPlaces.hospitals.slice(0, 2).map((place, idx) => (
                <div key={idx} className="bg-white p-3 rounded-lg mb-2 border-l-4 border-red-400">
                  <p className="font-semibold">{place.name}</p>
                  <p className="text-sm text-gray-600">{Math.round(place.distance)}m away</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const VisionMode = ({ showCamera, currentLocation, onDescribeScene, onToggleCamera, onSpeakLocation, speak, processing }) => {
  return (
    <div className="space-y-4">
      <div className="bg-gray-50 p-6 rounded-xl text-center">
        <button onClick={onDescribeScene} disabled={processing || !showCamera} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transition-all mb-4 disabled:opacity-50 disabled:cursor-not-allowed">
          {processing ? (
            <><Loader className="inline w-6 h-6 mr-2 animate-spin" />Analyzing...</>
          ) : (
            <><Eye className="inline w-6 h-6 mr-2" />Describe Scene</>
          )}
        </button>
        <button onClick={onToggleCamera} className="w-full bg-gradient-to-r from-gray-600 to-gray-700 text-white px-6 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transition-all">
          {showCamera ? <><VideoOff className="inline w-6 h-6 mr-2" />Stop Camera</> : <><Video className="inline w-6 h-6 mr-2" />Start Camera</>}
        </button>
        <p className="text-sm text-gray-600 mt-4">Point camera ahead and tap Describe Scene</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => speak('Camera is ' + (showCamera ? 'active' : 'inactive'))} className="bg-indigo-100 text-indigo-700 px-4 py-3 rounded-lg font-semibold hover:bg-indigo-200 transition-all">🔊 Status</button>
        <button onClick={onSpeakLocation} disabled={!currentLocation} className="bg-green-100 text-green-700 px-4 py-3 rounded-lg font-semibold hover:bg-green-200 transition-all disabled:opacity-50">📍 Location</button>
      </div>
    </div>
  );
};

export default function App() {
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        streamRef.current = stream;
        setShowCamera(true);
        speak('Camera activated');
      }
    } catch (err) {
      console.error('Camera error:', err);
      speak('Camera access denied');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setShowCamera(false);
      speak('Camera stopped');
    }
  };

  const captureAndAnalyze = async (isObstacleCheck = false) => {
    if (!videoRef.current || !canvasRef.current) {
      speak('Camera not ready');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.readyState < 2) {
      speak('Camera still loading');
      return;
    }

    try {
      setProcessing(true);
      speak('Analyzing scene');

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      const payload = {
        image: imageData,
        continuous: isObstacleCheck,
        tell: !isObstacleCheck,
        warnOnly: isObstacleCheck,
        latitude: currentLocation?.lat,
        longitude: currentLocation?.lng,
        navigationMode: isNavigating,
        obstacleDetection: isObstacleCheck
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
        speak(data.alert.message, true);
      }

      if (data.aiDescription && data.shouldSpeak) {
        speak(data.aiDescription, true);
      }

      if (data.maps?.nearby) {
        setNearbyPlaces(data.maps.nearby);
      }

      if (data.maps?.navigation && isNavigating) {
        setCurrentInstruction(data.maps.navigation.next_instruction);
        setDistanceRemaining(data.maps.navigation.total_remaining);
      }

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
    if (!currentLocation) {
      speak('Waiting for GPS');
      return;
    }

    speak('Starting navigation to ' + destination);
    setIsNavigating(true);
    
    if (!showCamera) await startCamera();
    
    try {
      const payload = {
        image: canvasRef.current?.toDataURL('image/jpeg', 0.5) || '',
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        destination_address: destination,
        navigationMode: true,
        getRoute: true,
        continuous: true
      };

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.maps?.navigation) {
          setCurrentInstruction(data.maps.navigation.next_instruction);
          setDistanceRemaining(data.maps.navigation.total_remaining);
          speak(data.maps.navigation.next_instruction);
        }
      }
    } catch (err) {
      console.error('Navigation start error:', err);
    }

    startObstacleDetection();
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setCurrentInstruction('');
    setDistanceRemaining('');
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
          {mode === 'navigation' && <NavigationMode isNavigating={isNavigating} destination={destination} setDestination={setDestination} currentLocation={currentLocation} currentInstruction={currentInstruction} distanceRemaining={distanceRemaining} alert={alert} nearbyPlaces={nearbyPlaces} onStartNavigation={startNavigation} onStopNavigation={stopNavigation} onFindNearby={findNearby} onSpeakLocation={speakCurrentLocation} onRepeatInstruction={() => currentInstruction && speak(currentInstruction)} />}
          {mode === 'vision' && <VisionMode showCamera={showCamera} currentLocation={currentLocation} onDescribeScene={describeScene} onToggleCamera={showCamera ? stopCamera : startCamera} onSpeakLocation={speakCurrentLocation} speak={speak} processing={processing} />}
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