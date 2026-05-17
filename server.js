const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// =============================================================
//  Persistent schedule storage
//  Render restarts wipe in-memory state, so we write to disk.
//  schedule.json sits next to server.js.
// =============================================================
const SCHEDULE_FILE = path.join(__dirname, "schedule.json");

function loadSchedule() {
    try {
        if (fs.existsSync(SCHEDULE_FILE)) {
            const raw = fs.readFileSync(SCHEDULE_FILE, "utf8");
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error("Failed to read schedule.json:", e.message);
    }
    return { autoArmTime: "16:00", autoDisarmTime: "06:30" };
}

function saveSchedule(armTime, disarmTime) {
    try {
        fs.writeFileSync(
            SCHEDULE_FILE,
            JSON.stringify({ autoArmTime: armTime, autoDisarmTime: disarmTime }),
            "utf8"
        );
    } catch (e) {
        console.error("Failed to write schedule.json:", e.message);
    }
}

// Load on boot
const savedSchedule = loadSchedule();
let autoArmTime    = savedSchedule.autoArmTime;
let autoDisarmTime = savedSchedule.autoDisarmTime;

console.log("SCHEDULE LOADED → ARM:", autoArmTime, "DISARM:", autoDisarmTime);

// =============================================================
//  Runtime state
// =============================================================
let alarmStatus    = "armed";
let history        = [];
let lastSeen       = 0;

function formatTime() {
    return new Date().toLocaleString("en-GB", {
        year:   "numeric",
        month:  "2-digit",
        day:    "2-digit",
        hour:   "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function addHistory(description, source = "System", status = "Info") {
    history.push({ description, source, status, datetime: formatTime() });
    if (history.length > 50) history.shift();
}

// =============================================================
//  Auto arm / disarm scheduler
//  Checks every minute (no need for every second — less noise).
//  Compares HH:MM strings so there's no timezone drift issue.
// =============================================================
setInterval(() => {
    const now = new Date();
    const currentTime =
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0");

    if (currentTime === autoArmTime && alarmStatus !== "armed") {
        alarmStatus = "armed";
        console.log("AUTO ARMED at", currentTime);
        addHistory("AUTO ARMED", "Scheduler", "Armed");
    }

    if (currentTime === autoDisarmTime && alarmStatus !== "disarmed") {
        alarmStatus = "disarmed";
        console.log("AUTO DISARMED at", currentTime);
        addHistory("AUTO DISARMED", "Scheduler", "Disarmed");
    }

}, 60 * 1000); // every 60 seconds

// =============================================================
//  Routes — ESP32
// =============================================================

// ESP32 posts all events here
app.post("/event", (req, res) => {
    console.log("ESP32 EVENT:", req.body);
    lastSeen = Date.now();

    if (req.body.type === "intrusion") {
        let msg = "INTRUSION DETECTED";
        if (req.body.distance && req.body.distance > 0) msg += ` (${req.body.distance}cm)`;
        addHistory(msg, "Sensor", "Triggered");
    }

    if (req.body.type === "rfid_tap" && req.body.status === "toggle") {
        alarmStatus = alarmStatus === "armed" ? "disarmed" : "armed";
        addHistory(`RFID → ${alarmStatus.toUpperCase()}`, "RFID Scanner",
            alarmStatus === "armed" ? "Armed" : "Disarmed");
    }

    res.json({ success: true });
});

// ESP32 polls this to know current armed state
app.get("/command", (req, res) => {
    res.json({ status: alarmStatus });
});

// =============================================================
//  Routes — Dashboard
// =============================================================

app.get("/status", (req, res) => {
    res.json({ status: alarmStatus, autoArmTime, autoDisarmTime });
});

app.get("/device-status", (req, res) => {
    const online = (Date.now() - lastSeen) < 8000;
    res.json({ online, alarmStatus });
});

app.post("/arm", (req, res) => {
    alarmStatus = "armed";
    addHistory("MANUAL ARM", "Dashboard", "Armed");
    res.json({ success: true });
});

app.post("/disarm", (req, res) => {
    alarmStatus = "disarmed";
    addHistory("MANUAL DISARM", "Dashboard", "Disarmed");
    res.json({ success: true });
});

app.post("/toggle", (req, res) => {
    alarmStatus = alarmStatus === "armed" ? "disarmed" : "armed";
    addHistory(`MANUAL TOGGLE → ${alarmStatus.toUpperCase()}`, "Dashboard",
        alarmStatus === "armed" ? "Armed" : "Disarmed");
    res.json({ success: true, status: alarmStatus });
});

// Save schedule — now also writes to disk so it survives restarts
app.post("/set-times", (req, res) => {
    const { armTime, disarmTime } = req.body;

    if (!armTime || !disarmTime) {
        return res.status(400).json({ error: "armTime and disarmTime required" });
    }

    autoArmTime    = armTime;
    autoDisarmTime = disarmTime;

    saveSchedule(autoArmTime, autoDisarmTime); // <-- persists to disk

    console.log("NEW SCHEDULE SAVED:", autoArmTime, "→", autoDisarmTime);
    addHistory(`AUTO TIMES UPDATED (${autoArmTime} → ${autoDisarmTime})`, "Settings", "Updated");

    res.json({ success: true, autoArmTime, autoDisarmTime });
});

app.get("/api/history", (req, res) => res.json(history));

// =============================================================
//  Start
// =============================================================
app.listen(PORT, "0.0.0.0", () => {
    console.log("BEEP SERVER RUNNING ON PORT", PORT);
});
