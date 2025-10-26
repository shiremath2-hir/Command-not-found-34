


// ================================
// File: src/components/UIComponents.jsx
// (Holds presentational components only)
// ================================
import React from 'react';
import { Navigation, MapPin, AlertTriangle, Camera, Eye, Phone, VideoOff, Video, Loader } from 'lucide-react';
import { Camera as ReactCamera } from 'react-camera-pro';

export const CameraView = ({ showCamera, videoRef, alert, processing }) => {
  return (
    <div className="mb-4 relative">
      {showCamera ? (
        <>
          <div className="w-full h-64 rounded-xl shadow-lg overflow-hidden">
            <ReactCamera
              ref={videoRef}
              aspectRatio="cover"
              numberOfCamerasCallback={(n) => console.log('Number of cameras:', n)}
              videoSourceDeviceId={undefined}
              onUserMedia={() => console.log('Camera ready')}
              onUserMediaError={(error) => console.error('Camera error:', error)}
            />
          </div>
          <div className="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
            <Video className="w-4 h-4" />LIVE
          </div>
        </>
      ) : (
        <div className="w-full h-64 bg-gray-200 rounded-xl shadow-lg flex items-center justify-center border-2 border-dashed border-gray-400">
          <div className="text-center text-gray-600">
            <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-lg font-semibold">Camera Off</p>
            <p className="text-sm">Click "Start Camera" to begin</p>
          </div>
        </div>
      )}
      
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

export const NavigationMode = ({ isNavigating, destination, setDestination, currentLocation, currentInstruction, distanceRemaining, alert, nearbyPlaces, onStartNavigation, onStopNavigation, onFindNearby, onSpeakLocation, onRepeatInstruction }) => {
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-bold">Current Direction</h3>
              <div className="text-sm opacity-90">Real-time Navigation</div>
            </div>
            <p className="text-2xl font-semibold mb-2">{currentInstruction || 'Calculating route...'}</p>
            <p className="text-lg opacity-90 mb-2">{distanceRemaining && `Distance: ${distanceRemaining}`}</p>
            <div className="text-sm opacity-75">
              📍 GPS tracking active • 🎥 Camera monitoring • 🔊 Voice guidance enabled
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onStopNavigation} className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-6 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transition-all">
              🛑 Stop Navigation
            </button>
            <button onClick={onRepeatInstruction} disabled={!currentInstruction} className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-4 rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50">
              🔊 Repeat Instruction
            </button>
          </div>
          
          <div className="bg-blue-50 border-2 border-blue-300 p-4 rounded-xl">
            <h4 className="font-bold text-blue-800 mb-2">🧭 Navigation Features:</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Real-time turn-by-turn directions</li>
              <li>• Voice guidance every 5 seconds</li>
              <li>• Obstacle detection with camera</li>
              <li>• Pedestrian warnings</li>
              <li>• Distance announcements</li>
            </ul>
          </div>
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

export const VisionMode = ({ showCamera, currentLocation, onDescribeScene, onToggleCamera, onSpeakLocation, speak, processing }) => {
  return (
    <div className="space-y-4">
      <div className="bg-gray-50 p-6 rounded-xl text-center">
        <button onClick={onDescribeScene} disabled={processing} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-4 rounded-xl font-semibold text-lg hover:shadow-lg transition-all mb-4 disabled:opacity-50 disabled:cursor-not-allowed">
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


// ================================
// File: src/App.jsx
// (Your original App, but with components imported)
// ================================

// NOTE: The following helpers were referenced in your code. If they exist elsewhere in your project, keep using them.
// generateContextualGuidance, lastInstructionRef, lastDistanceRef
// If not defined, create them in the same module to avoid runtime errors.
