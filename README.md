# 🍩 DonutSMP Web-Controlled Bot

A lightweight, web-based control panel for managing multiple Minecraft bots on **DonutSMP** (or any other server). Built with [Mineflayer](https://github.com/PrismarineJS/mineflayer), [Express](https://expressjs.com/), and [Socket.io](https://socket.io/).

![Status](https://img.shields.io/badge/Status-Active-success)
![Node](https://img.shields.io/badge/Node.js-v18%2B-blue)
![License](https://img.shields.io/badge/License-Apache-green)

## ✨ Features

* **Web Dashboard**: Control bots from any browser (mobile/desktop).
* **Multi-Account Support**: Manage 2+ accounts simultaneously.
* **Live Logs**: Real-time game chat, action bar, and error logs via WebSockets.
* **Smart Anti-AFK**: Random head rotations to prevent AFK kicks (no hitting/swinging).
* **Auto-Reconnect**: Automatically rejoins if kicked or disconnected.
* **Connection Watchdog**: Detects "stuck" logins and restarts the process automatically.
* **Chat Control**: Send chat commands directly from the web interface.
