import React, { useState, useEffect, useRef } from 'react';
import { Navigation, MapPin, AlertTriangle, Camera, Eye, Phone, Mic, Volume2, VideoOff, Video, Loader } from 'lucide-react';
import VoiceController from './components/Voicecontroller';
import { CameraView, NavigationMode, VisionMode, VideoDemoPlayer } from './components/UIComponents';

 const API_ENDPOINT = import.meta.env.VITE_API_URL

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
  const [isVoiceControlActive, setIsVoiceControlActive] = useState(false);
  const [lastCommand, setLastCommand] = useState('');
  const recognitionRef = useRef(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const [demoVideoAnalyzing, setDemoVideoAnalyzing] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [detectedBoxes, setDetectedBoxes] = useState([]);
  const demoVideoRef = useRef(null);
  const demoCanvasRef = useRef(null);
  const analysisIntervalRef = useRef(null);

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

  const startVoiceControl = () => {
    if (!('webkitSpeechRecognition' in window)) {
      speak('Voice control not supported on this browser');
      return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsVoiceControlActive(true);
      console.log('🎤 Voice control started - Always listening');
    };

    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript.toLowerCase().trim();
      console.log('🎤 Heard:', transcript);

      setLastCommand(transcript);
      handleVoiceCommand(transcript);
    };

    recognition.onerror = (event) => {
      console.error('❌ Voice recognition error:', event.error);
      if (event.error === 'network') {
        speak('Network error, restarting voice control');
        setTimeout(() => recognition.start(), 1000);
      }
    };

    recognition.onend = () => {
      if (isVoiceControlActive) {
        console.log('🔄 Restarting recognition');
        recognition.start();
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoiceControl = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsVoiceControlActive(false);
      speak('Voice control deactivated');
      console.log('🛑 Voice control stopped');
    }
  };

  const handleVoiceCommand = (command) => {
    console.log('🎯 Executing command:', command);

    // Help - CHECK FIRST
    if (command.includes('help') || command.includes('what can you do') || command.includes('commands')) {
      speak('Prism voice commands. Say: navigate to, followed by your destination. Say: describe scene, to hear what is around you. Say: emergency, to find nearby hospitals. Say: stop, to stop navigation. Say: start camera, to enable camera. Say: help, to hear these instructions again.');
    }
    // Navigation commands - AUTO START
    else if (command.includes('navigate to') || command.includes('go to') || command.includes('take me to')) {
      const destination = command
        .replace('navigate to', '')
        .replace('go to', '')
        .replace('take me to', '')
        .trim();

      if (destination) {
        speak(`Navigating to ${destination}`);
        setDestination(destination);
        // AUTO START - No need to press Enter
        setTimeout(() => {
          startNavigation();
        }, 500);
      } else {
        speak('Please say where you want to go');
      }
    }
    // Stop navigation
    else if (command.includes('stop') && isNavigating) {
      stopNavigation();
    }
    // Describe scene
    else if (command.includes('describe') || command.includes('what do you see') ||
             command.includes('what is around') || command.includes('scene')) {
      speak('Analyzing scene');
      setTimeout(() => {
        if (typeof describeScene === 'function') {
          describeScene();
        } else if (typeof captureAndAnalyze === 'function') {
          captureAndAnalyze(false);
        } else {
          speak('Scene description not available');
        }
      }, 500);
    }
    // Find nearby
    else if (command.includes('emergency') || command.includes('hospital') || command.includes('find nearby')) {
      if (typeof findNearby === 'function') {
        findNearby();
      } else {
        speak('Nearby search not available');
      }
    }
    // Camera controls
    else if (command.includes('start camera') || command.includes('open camera')) {
      if (!showCamera) {
        startCamera();
      }
    }
    else if (command.includes('stop camera') || command.includes('close camera')) {
      if (showCamera) {
        setShowCamera(false);
        speak('Camera closed');
      }
    }
    // Unknown
    else {
      speak('Sorry, I did not understand. Say help for commands');
      console.log('❌ Unknown command:', command);
    }
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

  useEffect(() => {
    const timer = setTimeout(() => {
      speak('Welcome to Prism. Voice control active. You can say commands anytime.');
      setTimeout(() => startVoiceControl(), 3000);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Cleanup video analysis on unmount or mode change
  useEffect(() => {
    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }
    };
  }, [mode, uploadedVideoUrl]);

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
      // Only announce "Analyzing scene" when manually triggered, not during navigation obstacle checks
      if (!isObstacleCheck) {
        speak('Analyzing scene');
      }

      const imageData = videoRef.current.takePhoto();
      const base64Image = imageData.split(',')[1];

      const payload = {
        image: base64Image,
        continuous: isObstacleCheck,
        tell: !isObstacleCheck,
        warnOnly: isObstacleCheck,
        obstacleDetection: isObstacleCheck,
        getDirection: isObstacleCheck,
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

      // Handle obstacle warnings during navigation
      if (isObstacleCheck && data.obstacles) {
        handleObstacleWarning(data.obstacles);
      }

      // Handle general alerts (high priority - always speak)
      if (data.alert && data.alert.level !== 'none') {
        setAlert(data.alert);
        if (data.shouldSpeak) {
          speak(data.alert.message, true);
        }
      } else {
        setAlert(null);
      }

      // Only speak AI descriptions when NOT in obstacle check mode (i.e., manually requested)
      if (data.aiDescription && data.shouldSpeak && !isObstacleCheck) {
        let fullDescription = data.aiDescription;

        // Add obstacle warnings to scene description
        if (data.obstacles && data.obstacles.length > 0) {
          const nearbyObstacles = data.obstacles
            .filter(obs => obs.distance < 5) // Focus on obstacles within 5 meters
            .map(obs => {
              const position = obs.position < 0.45 ? 'on the left' :
                            obs.position > 0.55 ? 'on the right' : 'ahead';
              return `${obs.type} ${position}, ${Math.round(obs.distance)} meters away`;
            })
            .join('. ');

          if (nearbyObstacles) {
            fullDescription += `. Warning: ${nearbyObstacles}`;
          }
        }

        speak(fullDescription, true);
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

  const handleObstacleWarning = (obstacles) => {
    if (!obstacles || obstacles.length === 0) return;

    // Find the closest dangerous obstacle
    const dangerousObstacles = obstacles.filter(obs =>
      obs.distance < 3 && // Within 3 meters
      (obs.type === 'person' || obs.type === 'pedestrian' ||
       obs.type === 'pole' || obs.type === 'car' ||
       obs.type === 'bicycle' || obs.type === 'obstacle')
    );

    if (dangerousObstacles.length === 0) return;

    // Sort by distance, closest first
    dangerousObstacles.sort((a, b) => a.distance - b.distance);
    const closest = dangerousObstacles[0];

    // Determine direction based on position in frame
    // Assume obstacles have x position (0-1, where 0.5 is center)
    let warning = '';
    const position = closest.position || 0.5; // Default to center if no position

    console.log(`🎯 Obstacle detected: type=${closest.type}, distance=${closest.distance}m, position=${position}`);

    if (closest.distance < 1) {
      // Very close - STOP
      warning = `Stop! ${closest.type} ahead!`;
    } else if (position < 0.45) {
      // Obstacle on left - move right
      warning = `${closest.type} on your left, ${Math.round(closest.distance)} meters, move right`;
    } else if (position > 0.55) {
      // Obstacle on right - move left
      warning = `${closest.type} on your right, ${Math.round(closest.distance)} meters, move left`;
    } else {
      // Obstacle in center (only very center now) - continue straight
      warning = `${closest.type} ahead, ${Math.round(closest.distance)} meters, continue straight`;
    }

    // Speak the warning
    speak(warning, true);
    console.log('⚠️ Obstacle warning:', warning);
  };

  const startObstacleDetection = () => {
    if (obstacleCheckIntervalRef.current) {
      clearInterval(obstacleCheckIntervalRef.current);
    }
    obstacleCheckIntervalRef.current = setInterval(() => {
      captureAndAnalyze(true);
    }, 2000); // Check every 2 seconds for obstacles
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
    }, 2000);
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
        heading: currentLocation.heading,
        destination_address: destination,
        navigationMode: true,
        getRoute: true,
        getBearing: true,
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

          // Speak at distance milestones
          if (lastDistanceRef.current !== null) {
            const lastDist = lastDistanceRef.current;
            if ((lastDist > 200 && currentDistance <= 200) ||
                (lastDist > 100 && currentDistance <= 100) ||
                (lastDist > 50 && currentDistance <= 50) ||
                (lastDist > 30 && currentDistance <= 30) ||
                (lastDist > 20 && currentDistance <= 20) ||
                (lastDist > 10 && currentDistance <= 10) ||
                (lastDist > 5 && currentDistance <= 5)) {
              shouldSpeak = true;
            }
          }

          // For continuous guidance: repeat every 6 seconds when close to turn (under 50m)
          // This ensures user always knows where they're going
          if (!shouldSpeak && currentDistance < 50) {
            if (!lastInstructionRef.current || Date.now() - (lastInstructionRef.lastSpokenTime || 0) > 6000) {
              shouldSpeak = true;
              lastInstructionRef.lastSpokenTime = Date.now();
            }
          }

          lastDistanceRef.current = currentDistance;
          lastInstructionRef.current = nav.next_instruction;

          if (shouldSpeak) {
            const voiceGuidance = generateContextualGuidance(nav, currentLocation);
            speak(voiceGuidance, true); // Always interrupt old voice when navigating
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

  const calculateBearing = (lat1, lon1, lat2, lon2) => {
    const toRadians = (deg) => deg * (Math.PI / 180);
    const toDegrees = (rad) => rad * (180 / Math.PI);

    const dLon = toRadians(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
    const x = Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
              Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);

    let bearing = toDegrees(Math.atan2(y, x));
    bearing = (bearing + 360) % 360;

    return bearing;
  };

  const calculateTurnDirection = (userHeading, targetBearing) => {
    if (!userHeading || userHeading === null || !targetBearing) {
      return 'straight';
    }

    let angleDiff = targetBearing - userHeading;

    if (angleDiff > 180) angleDiff -= 360;
    if (angleDiff < -180) angleDiff += 360;

    if (Math.abs(angleDiff) < 15) {
      return 'straight';
    } else if (angleDiff > 150 || angleDiff < -150) {
      return 'turn around';
    } else if (angleDiff > 15 && angleDiff < 85) {
      return 'slight right';
    } else if (angleDiff >= 85 && angleDiff <= 95) {
      return 'sharp right';
    } else if (angleDiff > 95) {
      return 'right';
    } else if (angleDiff < -15 && angleDiff > -85) {
      return 'slight left';
    } else if (angleDiff <= -85 && angleDiff >= -95) {
      return 'sharp left';
    } else {
      return 'left';
    }
  };

  const convertCompassToSimpleDirection = (instruction, userHeading) => {
    if (!instruction) return instruction;

    const compassDirections = {
      'north': 0, 'n': 0,
      'northeast': 45, 'north east': 45, 'ne': 45,
      'east': 90, 'e': 90,
      'southeast': 135, 'south east': 135, 'se': 135,
      'south': 180, 's': 180,
      'southwest': 225, 'south west': 225, 'sw': 225,
      'west': 270, 'w': 270,
      'northwest': 315, 'north west': 315, 'nw': 315
    };

    let modifiedInstruction = instruction.toLowerCase();
    let bearing = null;

    for (const [direction, angle] of Object.entries(compassDirections)) {
      const regex = new RegExp(`\\b${direction}\\b`, 'i');
      if (regex.test(modifiedInstruction)) {
        bearing = angle;
        break;
      }
    }

    if (bearing !== null && userHeading !== null && userHeading !== undefined) {
      const turnDir = calculateTurnDirection(userHeading, bearing);

      if (modifiedInstruction.includes('head') || modifiedInstruction.includes('continue')) {
        modifiedInstruction = modifiedInstruction
          .replace(/head\s+(north|northeast|east|southeast|south|southwest|west|northwest|north east|south east|south west|north west|n|ne|e|se|s|sw|w|nw)/gi, `go ${turnDir}`)
          .replace(/continue\s+(north|northeast|east|southeast|south|southwest|west|northwest|north east|south east|south west|north west|n|ne|e|se|s|sw|w|nw)/gi, `continue ${turnDir}`);
      } else if (modifiedInstruction.includes('turn')) {
        modifiedInstruction = modifiedInstruction
          .replace(/turn\s+(north|northeast|east|southeast|south|southwest|west|northwest|north east|south east|south west|north west|n|ne|e|se|s|sw|w|nw)/gi, `turn ${turnDir}`);
      } else {
        modifiedInstruction = modifiedInstruction
          .replace(/(north|northeast|east|southeast|south|southwest|west|northwest|north east|south east|south west|north west|n|ne|e|se|s|sw|w|nw)/gi, turnDir);
      }
    }

    return modifiedInstruction.charAt(0).toUpperCase() + modifiedInstruction.slice(1);
  };

  const parseDistanceToMeters = (distanceText) => {
    if (!distanceText) return 999999;
    
    // Remove any commas and trim
    const cleanText = distanceText.toString().replace(/,/g, '').trim();
    
    const match = cleanText.match(/(\d+\.?\d*)\s*(kilometers?|km|miles?|mi|feet|ft|meters?|m)/i);
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
    let instruction = navData.next_instruction || '';
    const bearing = navData.bearing || navData.next_bearing;

    // Convert compass directions to simple left/right/straight
    if (instruction && location?.heading !== null) {
      instruction = convertCompassToSimpleDirection(instruction, location.heading);
    }

    // Add real-time turn direction if we have bearing
    let directionGuidance = '';
    if (location?.heading !== null && bearing) {
      const turnDirection = calculateTurnDirection(location.heading, bearing);

      if (turnDirection !== 'straight') {
        directionGuidance = `${turnDirection}, `;
      }
    }

    // Format distance in a more natural way
    let distanceText = '';
    if (distance) {
      const meters = parseDistanceToMeters(distance);
      if (meters < 10) {
        distanceText = 'in 10 meters';
      } else if (meters < 20) {
        distanceText = 'in 20 meters';
      } else if (meters < 50) {
        distanceText = 'in 50 meters';
      } else if (meters < 100) {
        distanceText = 'in 100 meters';
      } else if (meters < 200) {
        distanceText = 'in 200 meters';
      } else {
        distanceText = distance;
      }
    }

    if (distanceText && instruction) {
      return `${instruction} ${distanceText}`;
    } else if (instruction) {
      return instruction;
    } else if (directionGuidance) {
      return `${directionGuidance}continue`;
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

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
      speak(`${file.type.includes('video') ? 'Video' : 'Image'} uploaded. Analyzing now`);
      analyzeUploadedFile(file);
    }
  };

  const analyzeUploadedFile = async (file) => {
    try {
      setProcessing(true);
      speak('Analyzing uploaded file');

      // Convert file to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1];

        const payload = {
          image: base64Data,
          continuous: false,
          tell: true, // We want description
          warnOnly: false,
          obstacleDetection: true, // Detect obstacles in uploaded file
          getDirection: false,
          latitude: currentLocation?.lat,
          longitude: currentLocation?.lng,
          navigationMode: false,
          includeObstacleWarnings: true // Request obstacle warnings in description
        };

        console.log('📤 Sending uploaded file to API:', API_ENDPOINT);

        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('📥 API Response for uploaded file:', data);

        // Build description with obstacle warnings
        let fullDescription = '';

        if (data.aiDescription) {
          fullDescription = data.aiDescription;
        }

        // Add obstacle warnings
        if (data.obstacles && data.obstacles.length > 0) {
          const obstacleWarnings = data.obstacles
            .filter(obs => obs.distance < 5) // Focus on nearby obstacles
            .map(obs => {
              const position = obs.position < 0.45 ? 'on the left' :
                            obs.position > 0.55 ? 'on the right' : 'ahead';
              return `${obs.type} ${position}, ${Math.round(obs.distance)} meters away`;
            })
            .join('. ');

          if (obstacleWarnings) {
            fullDescription += `. Warning: ${obstacleWarnings}`;
          }
        }

        if (fullDescription) {
          speak(fullDescription, true);
        } else {
          speak('Could not analyze the file', true);
        }

        setProcessing(false);
      };

      reader.onerror = () => {
        speak('Error reading file');
        setProcessing(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error analyzing uploaded file:', error);
      speak('Error analyzing file');
      setProcessing(false);
    }
  };

  const handleVideoDemoUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (!file.type.includes('video') && !file.type.includes('image')) {
        speak('Please upload a video or image file');
        return;
      }

      // Clear previous analysis
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
      setDetectedBoxes([]);

      // Create URL for video display
      const videoUrl = URL.createObjectURL(file);
      setUploadedVideoUrl(videoUrl);

      speak('Demo video loaded. Starting playback with obstacle detection');
      setDemoVideoAnalyzing(true);
    }
  };

  const drawBoundingBoxes = (boxes) => {
    if (!demoCanvasRef.current || !demoVideoRef.current) return;

    const canvas = demoCanvasRef.current;
    const video = demoVideoRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw each bounding box
    boxes.forEach(box => {
      const left = box.box.Left * canvas.width;
      const top = box.box.Top * canvas.height;
      const width = box.box.Width * canvas.width;
      const height = box.box.Height * canvas.height;

      // Draw box
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 4;
      ctx.strokeRect(left, top, width, height);

      // Draw label background
      ctx.fillStyle = '#FF0000';
      const labelText = `${box.label} ${Math.round(box.distance || 0)}m`;
      const textWidth = ctx.measureText(labelText).width;
      ctx.fillRect(left, top - 30, textWidth + 20, 30);

      // Draw label text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px Arial';
      ctx.fillText(labelText, left + 10, top - 8);
    });
  };

  const analyzeVideoFrame = async () => {
    if (!demoVideoRef.current || !demoCanvasRef.current) return;

    const video = demoVideoRef.current;
    if (video.paused || video.ended) return;

    try {
      // Capture current frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      const base64Data = imageData.split(',')[1];

      const payload = {
        image: base64Data,
        continuous: false,
        tell: false,
        warnOnly: true,
        obstacleDetection: true,
        getDirection: true,
        latitude: currentLocation?.lat,
        longitude: currentLocation?.lng,
        navigationMode: true
      };

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) return;

      const data = await response.json();
      console.log('📥 Frame analysis:', data);

      // Update bounding boxes
      if (data.boundingBoxes && data.boundingBoxes.length > 0) {
        // Add distance info to boxes
        const boxesWithDistance = data.boundingBoxes.map((box, index) => {
          const obstacle = data.obstacles && data.obstacles[index];
          return {
            ...box,
            distance: obstacle ? obstacle.distance : null
          };
        });
        setDetectedBoxes(boxesWithDistance);
        drawBoundingBoxes(boxesWithDistance);
      } else {
        setDetectedBoxes([]);
        drawBoundingBoxes([]);
      }

      // Give voice warnings for obstacles
      if (data.obstacles && data.obstacles.length > 0) {
        const dangerousObstacles = data.obstacles.filter(obs => obs.distance < 5);

        if (dangerousObstacles.length > 0) {
          const closest = dangerousObstacles[0];
          let warning = '';
          const position = closest.position || 0.5;

          if (closest.distance < 1.5) {
            warning = `Stop! ${closest.type} very close ahead!`;
          } else if (position < 0.45) {
            warning = `${closest.type} on your left, ${Math.round(closest.distance)} meters, move right`;
          } else if (position > 0.55) {
            warning = `${closest.type} on your right, ${Math.round(closest.distance)} meters, move left`;
          } else {
            warning = `${closest.type} ahead, ${Math.round(closest.distance)} meters, continue straight`;
          }

          speak(warning, true);
        }
      }
    } catch (error) {
      console.error('Frame analysis error:', error);
    }
  };

  const handleVideoPlay = () => {
    // Analyze frames every 2 seconds
    analysisIntervalRef.current = setInterval(() => {
      analyzeVideoFrame();
    }, 2000);
  };

  const handleVideoEnd = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
    }
    setDemoVideoAnalyzing(false);
    speak('Demo video completed');
  };

  const stopDemoVideo = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
    }
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }
    setUploadedVideoUrl(null);
    setDetectedBoxes([]);
    setDemoVideoAnalyzing(false);
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

  // -------------------- UI --------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700">
      <div className="min-h-screen bg-white overflow-hidden">
        <VoiceController isListening={isListening} onToggle={setIsListening} onCommand={handleVoiceCommand} />
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 text-center">
          <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-3">
            <Eye className="w-8 h-8" />Prism
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
              onFileUpload={handleFileUpload}
              fileInputRef={fileInputRef}
              onVideoDemoUpload={handleVideoDemoUpload}
              videoFileInputRef={videoFileInputRef}
              demoVideoAnalyzing={demoVideoAnalyzing}
              uploadedVideoUrl={uploadedVideoUrl}
              demoVideoRef={demoVideoRef}
              demoCanvasRef={demoCanvasRef}
              onVideoPlay={handleVideoPlay}
              onVideoEnd={handleVideoEnd}
              onStopVideo={stopDemoVideo}
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