const mineflayer = require('mineflayer');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// ===== Configuration =====
// 1. IP of the server you want to join
const MC_HOST = 'donutsmp.net'; 

// 2. Version of Minecraft (IMPORTANT: Must match server to fix ECONNRESET)
const MC_VERSION = '1.20.4'; 

// 3. Port for your web dashboard (http://localhost:3050)
const PORT = 3050;

// ===== Web Server Setup =====
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the 'public' folder (where your HTML file lives)
app.use(express.static('public'));

// ===== Bot State =====
// We store data for 2 bots here. 'client' holds the actual bot instance.
const bots = {
    1: { client: null, active: false, isSpawned: false, afkInterval: null, reconnectTimer: null, loginTimeout: null, logs: [], email: "", username: "Account 01" },
    2: { client: null, active: false, isSpawned: false, afkInterval: null, reconnectTimer: null, loginTimeout: null, logs: [], email: "", username: "Account 02" }
};

// ===== Helper Functions =====

// 1. Logging: Sends messages to the console AND the web dashboard
function log(id, msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    // Remove weird color codes from the console logs
    const cleanMsg = msg.toString().replace(/\u001b\[[0-9;]*m/g, ""); 
    
    console.log(`[Bot ${id}] ${cleanMsg}`);
    
    // Save to history and send to website
    const logEntry = { msg: `[${time}] ${cleanMsg}`, type };
    bots[id].logs.push(logEntry);
    if (bots[id].logs.length > 100) bots[id].logs.shift(); // Keep only last 100 logs
    io.emit('log', { id, ...logEntry });
}

// 2. Anti-AFK: Prevents the bot from getting kicked
function startAntiAfk(id) {
    if (bots[id].afkInterval) clearInterval(bots[id].afkInterval);
    
    bots[id].afkInterval = setInterval(() => {
        const bot = bots[id].client;
        if (!bot) return;

        // SAFE: Just look around randomly. No hitting, no moving.
        const yaw = Math.random() * Math.PI - (0.5 * Math.PI);
        const pitch = Math.random() * Math.PI - (0.5 * Math.PI);
        bot.look(yaw, pitch, false);
    }, 15000); // Run every 15 seconds
}

// 3. Create Bot: The main logic to join the server
function createBot(id, email) {
    // Clear old timers to prevent bugs
    if (bots[id].reconnectTimer) clearTimeout(bots[id].reconnectTimer);
    if (bots[id].loginTimeout) clearTimeout(bots[id].loginTimeout);

    bots[id].active = true;
    bots[id].email = email;
    bots[id].isSpawned = false;
    
    // Tell website: "Bot is trying to connect..."
    io.emit('status', { id, online: true, email, username: bots[id].username }); 

    if (bots[id].client) return; // Don't create if already exists

    log(id, `Connecting to ${MC_HOST} (${MC_VERSION})...`, 'system');

    // --- MINEFLAYER CREATION ---
    const bot = mineflayer.createBot({
        host: MC_HOST,
        username: email,
        auth: 'microsoft',
        version: MC_VERSION,        // Fixes ECONNRESET
        checkTimeoutInterval: 90000, // 90s timeout (Fixes lag disconnects)
        hideErrors: false            // Show errors so we can debug
    });

    bots[id].client = bot;

    // --- WATCHDOG: Restart if stuck "Connecting" for 60s ---
    bots[id].loginTimeout = setTimeout(() => {
        if (!bots[id].isSpawned) {
            log(id, '⚠️ Login timed out (Stuck). Restarting...', 'error');
            bot.end(); // Kills the bot so it can auto-reconnect
        }
    }, 60000);

    // --- EVENTS ---
    
    // 1. Spawn: Bot successfully joined
    bot.once('spawn', () => {
        bots[id].isSpawned = true;
        clearTimeout(bots[id].loginTimeout); // Stop the watchdog
        bot.physicsEnabled = true;

        log(id, '✅ Spawned in game', 'success');
        bots[id].username = bot.username;
        
        // Update website
        io.emit('profile_update', { id, username: bot.username });
        io.emit('status', { id, online: true, email, username: bot.username });
        
        startAntiAfk(id);
    });

    // 2. Chat: Log chat messages
    bot.on('messagestr', (message) => {
        if (message.trim().length > 0) log(id, message, 'chat');
    });

    // 3. Kicked: Log why we got kicked
    bot.on('kicked', (reason) => {
        log(id, `⚠️ Kicked: ${reason}`, 'error');
    });

    // 4. Error: Log internal errors
    bot.on('error', (err) => {
        log(id, `❌ Error: ${err.message}`, 'error');
    });

    // 5. End: Bot disconnected (clean up and reconnect)
    bot.on('end', () => {
        bots[id].isSpawned = false;
        log(id, 'Disconnected', 'error');
        
        // Remove listeners to prevent memory leaks
        if (bots[id].client) {
            bots[id].client.removeAllListeners();
            bots[id].client = null;
        }
        
        // Auto-Reconnect if user didn't click "Stop"
        if (bots[id].active) {
            log(id, 'Reconnecting in 15s...', 'system');
            io.emit('status', { id, online: true, email, username: bots[id].username });
            bots[id].reconnectTimer = setTimeout(() => {
                createBot(id, email);
            }, 15000);
        } else {
            // User clicked stop, so we stay offline
            io.emit('status', { id, online: false, email, username: bots[id].username });
        }
    });
}

// 4. Stop Bot: Disconnects manually
function stopBot(id) {
    bots[id].active = false;
    bots[id].isSpawned = false;
    log(id, '🛑 Stopping...', 'system');
    
    if (bots[id].reconnectTimer) clearTimeout(bots[id].reconnectTimer);
    if (bots[id].loginTimeout) clearTimeout(bots[id].loginTimeout);
    if (bots[id].afkInterval) clearInterval(bots[id].afkInterval);
    
    if (bots[id].client) {
        bots[id].client.quit();
        bots[id].client = null;
    } else {
        io.emit('status', { id, online: false, email: bots[id].email, username: bots[id].username });
    }
}

// ===== Socket.io (Communication with Website) =====
io.on('connection', (socket) => {
    // 1. Sync State: Send current bot status to new webpage visitors
    [1, 2].forEach(id => {
        socket.emit('sync_state', {
            id,
            online: bots[id].active,
            logs: bots[id].logs,
            email: bots[id].email,
            username: bots[id].username
        });
    });

    // 2. Toggle: User clicked "Start/Stop Session"
    socket.on('toggle', (data) => {
        const { id, email } = data;
        if (bots[id].active) stopBot(id);
        else createBot(id, email);
    });

    // 3. Command: User typed a command
    socket.on('command', (data) => {
        const { id, cmd } = data;
        // Only allow chat if bot is spawned
        if (bots[id].client && bots[id].isSpawned) {
            log(id, `> ${cmd}`, 'input');
            bots[id].client.chat(cmd);
        } else {
             log(id, `⚠️ Bot is connecting... wait a moment.`, 'error');
        }
    });

    // 4. Global Command: User sent command to ALL bots
    socket.on('global_command', (cmd) => {
        Object.keys(bots).forEach(id => {
            if (bots[id].client && bots[id].isSpawned) {
                log(id, `> [Global] ${cmd}`, 'input');
                bots[id].client.chat(cmd);
            }
        });
    });
});

// ===== Start Server =====
server.listen(PORT, () => {
    console.log(`Web Interface running at http://localhost:${PORT}`);
});
