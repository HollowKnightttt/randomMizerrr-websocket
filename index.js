const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = 3000;
const wss = new WebSocket.Server({ port: PORT });

// State tracking across the server session
const flyingPlayers = new Set();
const godPlayers = new Set();
const playerHomes = new Map();

console.log(`[WebSocket] Server running on port ${PORT}`);
console.log(`[WebSocket] Ready for multiplayer connections via Ngrok!`);

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WebSocket] A Minecraft client connected from ${clientIp}`);

    // Helper function to send commands back to Bedrock via this specific client socket
    function sendCommand(commandStr) {
        const commandPacket = {
            header: {
                version: 1,
                requestId: uuidv4(),
                messagePurpose: 'commandRequest',
                messageType: 'commandRequest'
            },
            body: {
                version: 1,
                commandLine: commandStr,
                origin: { type: 'player' }
            }
        };
        ws.send(JSON.stringify(commandPacket));
    }

    // Helper function to send chat messages back to the player
    function tellPlayer(player, message) {
        sendCommand(`tellraw "${player}" {"rawtext":[{"text":"§b[Server] §r${message}"}]}`);
    }

    // Automatically subscribe this client to chat events
    const subscribeMsg = {
        header: {
            version: 1,
            requestId: uuidv4(),
            messagePurpose: 'subscribe',
            messageType: 'commandRequest'
        },
        body: { eventName: 'PlayerMessage' }
    };
    ws.send(JSON.stringify(subscribeMsg));

    // Listen for incoming chat packets from the connected player
    ws.on('message', (data) => {
        try {
            const packet = JSON.parse(data);

            if (packet.body && packet.body.eventName === 'PlayerMessage') {
                const sender = packet.body.properties.Sender || packet.body.properties.PlayerName;
                const message = packet.body.properties.Message;

                if (message && message.startsWith('/.')) {
                    const args = message.trim().split(' ');
                    const command = args[0].toLowerCase();

                    console.log(`[Command] ${sender} executed: ${command}`);

                    switch (command) {
                        case '/.fly': {
                            const isFlying = flyingPlayers.has(sender);
                            if (isFlying) {
                                flyingPlayers.delete(sender);
                                sendCommand(`ability "${sender}" mayfly false`);
                                tellPlayer(sender, "Flight §cDisabled§r.");
                            } else {
                                flyingPlayers.add(sender);
                                sendCommand(`ability "${sender}" mayfly true`);
                                tellPlayer(sender, "Flight §aEnabled§r! Double-jump to fly.");
                            }
                            break;
                        }

                        case '/.god': {
                            const isGod = godPlayers.has(sender);
                            if (isGod) {
                                godPlayers.delete(sender);
                                sendCommand(`ability "${sender}" invulnerable false`);
                                tellPlayer(sender, "God Mode §cDisabled§r.");
                            } else {
                                godPlayers.add(sender);
                                sendCommand(`ability "${sender}" invulnerable true`);
                                tellPlayer(sender, "God Mode §aEnabled§r! You are invincible.");
                            }
                            break;
                        }

                        case '/.heal': {
                            sendCommand(`effect "${sender}" instant_health 1 255 true`);
                            sendCommand(`effect "${sender}" saturation 1 255 true`);
                            tellPlayer(sender, "Health and Hunger fully restored!");
                            break;
                        }

                        case '/.feed': {
                            sendCommand(`effect "${sender}" saturation 1 255 true`);
                            tellPlayer(sender, "Your hunger has been satisfied!");
                            break;
                        }

                        case '/.sethome': {
                            playerHomes.set(sender, `~ ~ ~`);
                            tellPlayer(sender, "Home set to your current location!");
                            break;
                        }

                        case '/.home': {
                            if (playerHomes.has(sender)) {
                                sendCommand(`tp "${sender}" ${playerHomes.get(sender)}`);
                                tellPlayer(sender, "Teleported to your home!");
                            } else {
                                tellPlayer(sender, "§cYou haven't set a home yet! Use /.sethome first.");
                            }
                            break;
                        }

                        case '/.day': {
                            sendCommand(`time set day`);
                            tellPlayer(sender, "Time set to §eDay§r.");
                            break;
                        }
                        
                        case '/.night': {
                            sendCommand(`time set night`);
                            tellPlayer(sender, "Time set to §9Night§r.");
                            break;
                        }

                        case '/.sun': {
                            sendCommand(`weather clear`);
                            tellPlayer(sender, "Weather set to §eClear§r.");
                            break;
                        }

                        case '/.nv': {
                            sendCommand(`effect "${sender}" night_vision 99999 1 true`);
                            tellPlayer(sender, "Night Vision applied.");
                            break;
                        }

                        case '/.spawn': {
                            const mob = args[1] || 'zombie';
                            sendCommand(`execute at "${sender}" run summon ${mob} ~ ~ ~2`);
                            tellPlayer(sender, `Spawned §e${mob}§r nearby.`);
                            break;
                        }

                        case '/.help': {
                            tellPlayer(sender, "§e--- Server Custom Commands ---");
                            tellPlayer(sender, "§a/.fly §r- Toggle flight");
                            tellPlayer(sender, "§a/.god §r- Toggle god mode");
                            tellPlayer(sender, "§a/.heal §r- Full health & hunger");
                            tellPlayer(sender, "§a/.feed §r- Max hunger bar");
                            tellPlayer(sender, "§a/.nv §r- Permanent Night Vision");
                            tellPlayer(sender, "§a/.sethome / .home §r- Home system");
                            tellPlayer(sender, "§a/.day / /.night §r- Set time");
                            tellPlayer(sender, "§a/.sun §r- Clear weather");
                            tellPlayer(sender, "§a/.spawn <mob> §r- Spawn entity");
                            break;
                        }

                        default: {
                            tellPlayer(sender, `§cUnknown command. Type §e/.help §cfor assistance.`);
                            break;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[Error] Failed to process incoming packet:', err);
        }
    });

    ws.on('close', () => {
        console.log(`[WebSocket] Minecraft client disconnected.`);
    });
});
