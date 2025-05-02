// --- DOM Elements ---
const startButton = document.getElementById('start-button');
const clearButton = document.getElementById('clear-button');
const downloadCsvButton = document.getElementById('download-csv-button');
const timeDisplay = document.getElementById('time-display');
const pointer = document.getElementById('pointer');
const clockFace = document.getElementById('clock-face');
const resultsLog = document.getElementById('results-log');
const intentionSection = document.getElementById('intention-section');
const intentionInput = document.getElementById('intention-input');
const confirmIntentionButton = document.getElementById('confirm-intention-button');
const participantIdDisplay = document.getElementById('participant-id-display');

// --- State Variables ---
let taskStarted = false;
let clockRunning = false;
let isStopPending = false;
let awaitingIntention = false;

// --- Task Parameters ---
const clockSpeedSeconds = 5.1;
const stopDelayMilliseconds = 1000;

// --- Data Collection ---
let trialCounter = 0;
let sessionResults = []; // Holds data ONLY for the current browser session
let currentTrialData = null; // Temp storage for the current trial
let participantId = null; // Will hold the participant's ID

// !!! Point to the Netlify Function endpoint !!!
const SERVER_ENDPOINT_URL = '/.netlify/functions/save-libet-trial';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    participantId = getParticipantId(); // Assign participant ID
    participantIdDisplay.textContent = participantId || 'N/A'; // Display it
    createTicks();
    displayResultsLog(); // Display empty log initially
    pointer.style.transform = `translate(-50%, -50%) rotate(0deg) translateX(180px)`; // Initial pointer position
    timeDisplay.textContent = `Ready... (Participant ID: ${participantId || 'N/A'})`;
    // Add listeners
    startButton.addEventListener('click', startTask);
    clearButton.addEventListener('click', clearSessionLog);
    downloadCsvButton.addEventListener('click', downloadSessionCSV);
    confirmIntentionButton.addEventListener('click', confirmIntentionAndSendData);
});

// --- Participant ID Placeholder ---
function getParticipantId() {
    let pid = sessionStorage.getItem('libetParticipantId');
    if (!pid) {
        pid = `P${Date.now().toString().slice(-6)}${Math.random().toString(36).substring(2, 5)}`;
        sessionStorage.setItem('libetParticipantId', pid);
    }
    return pid;
}

// --- Clock Face Setup ---
function createTicks() {
    const radius = 160, tickRadius = 190, bigTickRadius = 185;
    const clockFaceContent = document.createDocumentFragment(); // Create ticks efficiently
    // Add pointer back first if it was cleared (it shouldn't be with this structure)
    // if (pointer) clockFaceContent.appendChild(pointer.cloneNode(true)); // No need if pointer outside loop

    for (let i = 0; i < 60; i++) {
        const angle = i * 6; const tick = document.createElement('div');
        tick.classList.add('tick'); tick.style.setProperty('--angle', `${angle}deg`);
        if (i % 5 === 0) {
            tick.classList.add('big'); tick.style.transform = `translate(-50%, -100%) rotate(${angle}deg) translateY(-${bigTickRadius}px)`;
            const label = document.createElement('div'); label.classList.add('label');
            const labelValue = (i === 0) ? 60 : i; label.textContent = labelValue;
            const angleRad = (angle - 90) * Math.PI / 180;
            const x = radius * Math.cos(angleRad); const y = radius * Math.sin(angleRad);
            label.style.setProperty('--x', `${x}px`); label.style.setProperty('--y', `${y}px`); clockFaceContent.appendChild(label);
        } else {
            tick.classList.add('small'); tick.style.transform = `translate(-50%, -100%) rotate(${angle}deg) translateY(-${tickRadius}px)`;
        }
        clockFaceContent.appendChild(tick);
    }
    clockFace.appendChild(clockFaceContent); // Append all at once
    // Ensure pointer exists after clearing potentially
    if (!document.getElementById('pointer')) {
        const p = document.createElement('div');
        p.id = 'pointer';
        clockFace.appendChild(p);
        // Re-assign global pointer variable if needed, though direct ID access is fine
    }
}

// --- Session Results Display ---
function displayResultsLog() {
    resultsLog.innerHTML = '<h2>Session Log</h2>'; // Clear previous entries
    if (sessionResults.length === 0) {
         resultsLog.innerHTML += '<p>No trials completed in this session yet.</p>';
    } else {
        sessionResults.forEach(result => {
            const resultElement = document.createElement('p');
            let text = `Trial ${result.trial}: Start ~${result.startPosition ?? 'N/A'}, Intention ~${result.intentionTime ?? 'N/A'}`;
            // Uncomment below line if you want to show KeyPress (W-Time) in the session log
            // text += `, KeyPress ~${result.keyPressPosition ?? 'N/A'}`;
            resultElement.textContent = text;
            resultsLog.appendChild(resultElement);
        });
    }
     resultsLog.scrollTop = resultsLog.scrollHeight; // Scroll to bottom
}

// --- Clear Session Log ---
function clearSessionLog() {
    if (confirm("Clear the session log displayed on screen? (This will not delete data already saved on the server)")) {
        sessionResults = [];
        // Resetting trial counter for the session might be confusing, typically don't.
        // trialCounter = 0;
        currentTrialData = null;
        displayResultsLog();
        timeDisplay.textContent = `Session log cleared. Ready... (Participant ID: ${participantId || 'N/A'})`;
    }
}

// --- CSV Download (Session Data Only) ---
function downloadSessionCSV() {
    if (sessionResults.length === 0) {
        alert("No data in the current session log to download."); return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    const header = ["ParticipantID", "Trial", "StartPosition", "KeyPressPosition", "IntentionTime"];
    csvContent += header.join(",") + "\r\n";
    sessionResults.forEach(result => {
        const row = [ participantId, result.trial, result.startPosition ?? 'N/A', result.keyPressPosition ?? 'N/A', result.intentionTime ?? 'N/A' ];
        csvContent += row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(",") + "\r\n"; // Quote fields
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `libet_session_${participantId}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// --- Data Sending ---
async function sendDataToServer(dataToSend) {
    dataToSend.participantId = participantId; // Ensure participant ID is set

    timeDisplay.textContent = `Sending Trial ${dataToSend.trial} data... Please wait.`;
    confirmIntentionButton.disabled = true; // Disable confirm button during send

    try {
        const response = await fetch(SERVER_ENDPOINT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend),
        });

        const responseData = await response.json(); // Assume server sends JSON response

        if (!response.ok) { // Check if status code is 2xx
            console.error('Server Error:', response.status, responseData);
            const errorMessage = responseData?.message || `Server responded with status ${response.status}`;
            timeDisplay.textContent = `Error saving Trial ${dataToSend.trial}: ${errorMessage}. Please try again or contact researcher.`;
            confirmIntentionButton.disabled = false; // Re-enable button on error to allow retry
            // Do NOT proceed to reset the UI for next trial here
        } else {
            // Success!
            console.log(`Trial ${dataToSend.trial} data sent successfully:`, responseData);
            timeDisplay.textContent = `Trial ${dataToSend.trial} data saved. Ready for next trial.`;

            // Reset UI for the next trial ONLY on successful save
            awaitingIntention = false;
            currentTrialData = null; // Clear temp data
            intentionSection.style.display = 'none'; // Hide input
            startButton.textContent = 'Start Next Task';
            startButton.disabled = false; // Enable start for next trial
        }
    } catch (error) {
        // Network error (fetch itself failed)
        console.error('Network Error:', error);
        timeDisplay.textContent = `Error: Could not connect to server for Trial ${dataToSend.trial}. Check your internet connection and try again.`;
        confirmIntentionButton.disabled = false; // Re-enable button on network error
    }
}


// --- Task Flow ---
function startTask() {
  if (taskStarted || awaitingIntention) return; // Prevent starting if busy
  taskStarted = true;
  trialCounter++;
  clockRunning = false; isStopPending = false;
  pointer.style.animation = 'none'; // Stop previous animation if any

  const randomStartAngle = Math.floor(Math.random() * 360);
  pointer.style.transform = `translate(-50%, -50%) rotate(${randomStartAngle}deg) translateX(180px)`;
  const startPositionDegrees = (randomStartAngle + 90) % 360;
  const startPositionValue = Math.round(startPositionDegrees / 6);
  const displayStartPosition = (startPositionValue === 0 || startPositionValue > 60) ? 60 : startPositionValue;

  currentTrialData = {
      trial: trialCounter,
      startPosition: displayStartPosition,
      keyPressPosition: null,
      intentionTime: null
      // participantId added before sending
  };

  intentionSection.style.display = 'none'; // Ensure intention input is hidden
  startButton.textContent = `Trial ${trialCounter} Active`;
  startButton.disabled = true;
  timeDisplay.textContent = 'Press any key to start the dot.';
  // Add key listener specific to this trial's active phase
  document.addEventListener('keydown', handleKeyPress);
}

function startClock() {
  if (!clockRunning && taskStarted) {
    pointer.style.animation = `rotateDot ${clockSpeedSeconds}s linear infinite`;
    clockRunning = true; isStopPending = false;
    timeDisplay.textContent = 'Dot is moving. Press any key again to signal stop.';
  }
}

function initiateStop() {
    // Ensure we only initiate stop once per trial and have data object
    if (!clockRunning || isStopPending || !currentTrialData) return;
    isStopPending = true; // Set flag: visual stop is pending

    // Calculate position AT THE MOMENT of key press
    const computedStyle = window.getComputedStyle(pointer);
    const transformMatrix = computedStyle.transform || computedStyle.webkitTransform || computedStyle.mozTransform;
    let angle = 0;
    if (transformMatrix && transformMatrix !== 'none') {
        const matrix = transformMatrix.match(/^matrix\((.+)\)$/);
        if (matrix && matrix[1]) {
             const values = matrix[1].split(',').map(Number);
             if (values.length >= 2) { const a = values[0]; const b = values[1]; angle = Math.atan2(b, a) * (180 / Math.PI); if (angle < 0) angle += 360; }
        }
    }
    const clockPositionDegrees = (angle + 90) % 360;
    const clockValue = Math.round(clockPositionDegrees / 6);
    const keyPressPosition = (clockValue === 0 || clockValue > 60) ? 60 : clockValue; // W-Time

    // Store W-Time
    currentTrialData.keyPressPosition = keyPressPosition;

    // Update status, schedule visual stop
    timeDisplay.textContent = `Key press registered. Dot will stop shortly...`;
    setTimeout(finalizeStop, stopDelayMilliseconds);
}

function finalizeStop() {
    // Finalizes the visual stop and prompts for intention
    if (!isStopPending) return; // Ensure this runs only after initiateStop

    pointer.style.animation = 'none'; // Stop the visual animation

    // Update state flags
    clockRunning = false;
    isStopPending = false;
    taskStarted = false; // End of active movement part
    awaitingIntention = true; // Now waiting for user input

    // Clean up the key listener for movement phase
    document.removeEventListener('keydown', handleKeyPress);

    // Prepare and show intention input UI
    intentionInput.value = ''; // Clear any previous input
    intentionSection.style.display = 'flex'; // Show the section
    intentionInput.focus(); // Focus the input field for convenience
    timeDisplay.textContent = `Trial ${trialCounter}: Dot stopped. Please report your intention time (M-time).`;
    startButton.disabled = true; // Keep start disabled
    confirmIntentionButton.disabled = false; // Enable the confirm button
}

function confirmIntentionAndSendData() {
    // Handles confirming the intention time and triggering data send
    if (!awaitingIntention || !currentTrialData) return; // Only run if waiting

    const intentionValue = parseInt(intentionInput.value, 10);

    // Validate input
    if (isNaN(intentionValue) || intentionValue < 1 || intentionValue > 60) {
        alert("Please enter a valid intention time between 1 and 60.");
        intentionInput.select(); // Select input to easily change it
        return; // Stop execution until valid input
    }

    // Store M-Time
    currentTrialData.intentionTime = intentionValue;

    // Add a *copy* to the session log immediately for visual feedback
    sessionResults.push({ ...currentTrialData });
    displayResultsLog(); // Update the on-screen log

    // Disable confirm button while sending
    confirmIntentionButton.disabled = true;
    // Attempt to send the complete data to the server
    sendDataToServer(currentTrialData);
    // The sendDataToServer function will handle re-enabling the start button
    // and hiding the intention section *only* on successful transmission.
}

function handleKeyPress(event) {
    // Listener for key presses during the active clock phase
    event.preventDefault(); // Prevent space bar scrolling etc.
    if (!taskStarted) return; // Ignore if task not formally started

    if (!clockRunning) {
        startClock(); // First key press starts the clock visually
    } else if (!isStopPending) {
        // Second key press (and not already processing the stop)
        initiateStop();
    }
    // Key presses during the isStopPending visual delay are ignored
}