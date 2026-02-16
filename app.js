/**
 * NayaKura - Single Page Chat App
 * Core Application Logic
 */

// ==========================================
// 1. CONFIGURATION & SETUP
// ==========================================

// Firebase Configuration
const firebaseConfig = {
    apiKey: "YOUR API",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

// Global State
let currentUser = null;
let currentChatPartner = null; // { uid, name, emoji, username }
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallId = null;
let isVideoCall = false;

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// ==========================================
// 2. DOM ELEMENTS
// ==========================================

// Views
const authView = document.getElementById('auth-view');
const mainView = document.getElementById('main-view');
const chatView = document.getElementById('chat-view');
const videoCallView = document.getElementById('video-call-view');
const voiceCallView = document.getElementById('voice-call-view');

// Modals
const profileSetupModal = document.getElementById('profile-setup-modal');
const addFriendModal = document.getElementById('add-friend-modal');
const profileViewModal = document.getElementById('profile-view-modal');
const incomingCallModal = document.getElementById('incoming-call-modal');

// Lists & Content
const homeContent = document.getElementById('home-content');
const notificationsContent = document.getElementById('notifications-content');
const callsContent = document.getElementById('calls-content');
const chatMessages = document.getElementById('chat-messages');

// Inputs & Forms
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const forgotPassForm = document.getElementById('forgot-password-form');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

// Ringtone
const ringtone = document.getElementById('ringtone');

// ==========================================
// 3. UTILITY FUNCTIONS
// ==========================================

function showView(viewId) {
    // Hide all views
    document.querySelectorAll('.view:not(.call-view)').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.call-view').forEach(el => el.classList.add('hidden'));

    // Show requested view
    const view = document.getElementById(viewId);
    if (view) view.classList.remove('hidden');
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}

function showPanel(panelId) {
    // Hide all panels
    document.querySelectorAll('.content-panel').forEach(el => el.classList.add('hidden'));
    // Deactivate all tabs
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

    // Show requested
    document.getElementById(panelId).classList.remove('hidden');

    // Activate Tab
    if (panelId === 'home-content') document.getElementById('nav-home').classList.add('active');
    if (panelId === 'notifications-content') document.getElementById('nav-notifications').classList.add('active');
    if (panelId === 'calls-content') document.getElementById('nav-calls').classList.add('active');
}

function getChatId(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

// ==========================================
// 4. AUTHENTICATION LOGIC
// ==========================================

// Auth State Listener
auth.onAuthStateChanged(user => {
    if (user) {
        if (!user.emailVerified) {
            alert("Please verify your email address to continue.");
            auth.signOut();
            return;
        }

        currentUser = user;
        // Check if user profile exists in DB
        db.ref('users/' + user.uid).once('value').then(snapshot => {
            if (snapshot.exists()) {
                initApp();
            } else {
                // New user - show setup modal (or we handle during signup)
                // If we came from signup, the DB entry might be created there.
                // But if it's missing, show setup.
                showModal('profile-setup-modal');
            }
        });
    } else {
        currentUser = null;
        showView('auth-view');
    }
});

// Login
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');

    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            errorMsg.textContent = error.message;
        });
});

// Signup
signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value.trim().toLowerCase();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const errorMsg = document.getElementById('signup-error');

    if (!username.match(/^[a-z0-9_]{3,20}$/)) {
        errorMsg.textContent = "Username must be 3-20 characters, alphanumeric or underscore.";
        return;
    }

    // Check unique username first
    db.ref('usernames/' + username).once('value').then(snapshot => {
        if (snapshot.exists()) {
            errorMsg.textContent = "Username already taken.";
        } else {
            // Create User
            auth.createUserWithEmailAndPassword(email, password)
                .then(cred => {
                    // Send Email Verification
                    cred.user.sendEmailVerification();
                    alert("Account created! Verification email sent. Please verify before logging in.");

                    // Save preliminary data
                    const userData = {
                        email: email,
                        username: username,
                        name: username, // Fix: Default name to username
                        search_username: username, // for easier searching
                        uid: cred.user.uid
                    };

                    const updates = {};
                    updates['/users/' + cred.user.uid] = userData;
                    updates['/usernames/' + username] = cred.user.uid;

                    return db.ref().update(updates);
                })
                .then(() => {
                    auth.signOut(); // Force re-login after verification
                    toggleAuthForms('login');
                })
                .catch(error => {
                    errorMsg.textContent = error.message;
                });
        }
    });
});

// Forgot Password
forgotPassForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value;
    auth.sendPasswordResetEmail(email)
        .then(() => {
            document.getElementById('reset-msg').textContent = "Password reset email sent!";
            document.getElementById('reset-error').textContent = "";
        })
        .catch(error => {
            document.getElementById('reset-error').textContent = error.message;
        });
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut();
    window.location.reload(); // Clean state reset
});

// Toggle Auth Forms
document.getElementById('show-signup').addEventListener('click', () => toggleAuthForms('signup'));
document.getElementById('show-login').addEventListener('click', () => toggleAuthForms('login'));
document.getElementById('show-forgot-password').addEventListener('click', () => toggleAuthForms('forgot'));
document.getElementById('cancel-reset').addEventListener('click', () => toggleAuthForms('login'));

function toggleAuthForms(form) {
    loginForm.classList.add('hidden');
    signupForm.classList.add('hidden');
    forgotPassForm.classList.add('hidden');

    if (form === 'login') loginForm.classList.remove('hidden');
    if (form === 'signup') signupForm.classList.remove('hidden');
    if (form === 'forgot') forgotPassForm.classList.remove('hidden');
}

// ==========================================
// 5. PROFILE & INITIALIZATION
// ==========================================

// Pre-define Emojis
const emojiGrid = document.getElementById('setup-emoji-grid');
const emojis = ['👤', '😀', '😎', '🦁', '🐱', '🐼', '🦊', '🐸', '🤖', '👻', '👽', '💀', '💩', '🌟', '🔥'];
emojis.forEach(emoji => {
    const div = document.createElement('div');
    div.className = 'emoji-option';
    div.textContent = emoji;
    div.onclick = () => {
        document.querySelectorAll('.emoji-option').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        document.getElementById('setup-emoji').value = emoji;
    };
    emojiGrid.appendChild(div);
});

// Save Profile (Setup)
document.getElementById('save-profile-btn').addEventListener('click', () => {
    const name = document.getElementById('setup-name').value;
    const emoji = document.getElementById('setup-emoji').value;

    if (name) {
        db.ref('users/' + currentUser.uid).update({
            name: name,
            emoji: emoji
        }).then(() => {
            hideModal('profile-setup-modal');
            initApp();
        });
    }
});

function initApp() {
    showView('main-view');

    // Load My Profile
    db.ref('users/' + currentUser.uid).on('value', snap => {
        const data = snap.val();
        if (data) {
            // Setup Profile Modal Data
            document.getElementById('my-profile-name').textContent = data.name;
            document.getElementById('my-profile-username').textContent = '@' + data.username;
            document.getElementById('my-profile-email').textContent = data.email;
            document.getElementById('my-profile-emoji').textContent = data.emoji || '👤';
        }
    });

    // Listeners
    setupPresence(); // V2: Presence
    listenForFriendRequests();
    listenForContacts();
    listenForIncomingCalls();
}

// ==========================================
// 5.5. PRESENCE SYSTEM (V2)
// ==========================================
function setupPresence() {
    const userStatusDatabaseRef = db.ref('/users/' + currentUser.uid + '/status');
    const userLastSeenRef = db.ref('/users/' + currentUser.uid + '/lastSeen');

    firebase.database().ref('.info/connected').on('value', (snapshot) => {
        if (snapshot.val() == false) {
            return;
        }
        userStatusDatabaseRef.onDisconnect().set('offline').then(() => {
            userStatusDatabaseRef.set('online');
        });
        userLastSeenRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
    });
}



// ==========================================
// 6. FRIEND SYSTEM
// ==========================================

// Add Friend UI
document.getElementById('add-friend-btn').addEventListener('click', () => showModal('add-friend-modal'));
document.getElementById('cancel-add-friend').addEventListener('click', () => hideModal('add-friend-modal'));

// Add Friend Logic
document.getElementById('confirm-add-friend').addEventListener('click', () => {
    const targetUsername = document.getElementById('add-friend-username').value.trim().toLowerCase();
    const msgDiv = document.getElementById('add-friend-msg');

    if (targetUsername === "") return;

    db.ref('usernames/' + targetUsername).once('value').then(snapshot => {
        if (!snapshot.exists()) {
            msgDiv.textContent = "User not found.";
            msgDiv.style.color = "red";
            return;
        }

        const targetUid = snapshot.val();
        if (targetUid === currentUser.uid) {
            msgDiv.textContent = "You can't add yourself.";
            msgDiv.style.color = "red";
            return;
        }

        // Check if blocked
        checkIfBlocked(targetUid).then(isBlocked => {
            if (isBlocked) {
                msgDiv.textContent = "You have blocked this user.";
                return;
            }

            // Send Request
            db.ref(`requests/${targetUid}/${currentUser.uid}`).set({
                status: 'pending',
                timestamp: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                msgDiv.textContent = "Request sent!";
                msgDiv.style.color = "green";
                setTimeout(() => hideModal('add-friend-modal'), 1500);
            });
        });
    });
});

// Listen for Requests
function listenForFriendRequests() {
    const list = document.getElementById('friend-requests-list');
    db.ref(`requests/${currentUser.uid}`).on('value', snapshot => {
        list.innerHTML = '';
        if (!snapshot.exists()) {
            list.innerHTML = '<div class="empty-state">No new requests</div>';
            document.getElementById('updates-badge').classList.add('hidden');
            return;
        }

        const count = Object.keys(snapshot.val()).length;
        const badge = document.getElementById('updates-badge');
        badge.textContent = count;
        badge.classList.remove('hidden');

        snapshot.forEach(child => {
            const senderUid = child.key;
            // Fetch Sender Info
            db.ref(`users/${senderUid}`).once('value').then(userSnap => {
                let user = userSnap.val();
                if (!user) {
                    // Handle missing user data (Deleted user?)
                    user = { name: 'Unknown User', username: 'unknown', emoji: '❓' };
                }

                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = `
                    <div class="contact-avatar">${user.emoji || '👤'}</div>
                    <div class="item-details">
                        <div class="item-title">${user.name}</div>
                        <div class="item-subtitle">@${user.username} wants to be friends</div>
                    </div>
                    <div class="item-actions">
                        <button class="icon-btn" style="color:var(--success-color)" onclick="acceptRequest('${senderUid}')">✓</button>
                        <button class="icon-btn" style="color:var(--danger-color)" onclick="rejectRequest('${senderUid}')">✕</button>
                    </div>
                `;
                list.appendChild(item);
            });
        });
    });
}

window.acceptRequest = function (senderUid) {
    // Add to contacts for both
    const updates = {};
    updates[`contacts/${currentUser.uid}/${senderUid}`] = true;
    updates[`contacts/${senderUid}/${currentUser.uid}`] = true;
    updates[`requests/${currentUser.uid}/${senderUid}`] = null; // Remove request

    db.ref().update(updates);
};

window.rejectRequest = function (senderUid) {
    db.ref(`requests/${currentUser.uid}/${senderUid}`).remove();
};

// Listen for Contacts (Populate Chat List)
function listenForContacts() {
    const list = document.getElementById('home-content');
    db.ref(`contacts/${currentUser.uid}`).on('value', snapshot => {
        list.innerHTML = '';
        if (!snapshot.exists()) {
            list.innerHTML = '<div class="empty-state">No chats yet. Add a friend!</div>';
            return;
        }

        snapshot.forEach(child => {
            const friendUid = child.key;
            db.ref(`users/${friendUid}`).once('value').then(userSnap => {
                const user = userSnap.val();

                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = `
                    <div class="contact-avatar">${user.emoji || '👤'}</div>
                    <div class="item-details">
                         <div class="item-title">${user.name || user.username}</div>
                         <div class="item-subtitle" id="last-msg-${friendUid}">Click to chat</div>
                    </div>
                    <div class="item-meta">
                        <div class="unread-badge hidden" id="unread-${friendUid}">0</div>
                    </div>
                `;
                item.onclick = () => openChat(friendUid, user);
                list.appendChild(item);

                // Listen for unreads
                const chatId = getChatId(currentUser.uid, friendUid);
                db.ref(`unreadCounts/${currentUser.uid}/${chatId}`).on('value', countSnap => {
                    const count = countSnap.val() || 0;
                    const badge = document.getElementById(`unread-${friendUid}`);
                    if (count > 0) {
                        badge.textContent = count;
                        badge.classList.remove('hidden');
                    } else {
                        badge.classList.add('hidden');
                    }
                });
            });
        });
    });
}

// ==========================================
// 7. MESSAGING LOGIC
// ==========================================

let typingTimeout = null;
let currentReply = null; // V2: Reply Context

function openChat(friendUid, user) {
    currentChatPartner = { ...user, uid: friendUid };

    // UI Setup
    document.getElementById('chat-header-name').textContent = user.name || user.username; // Fix: Fallback
    document.getElementById('chat-header-avatar').textContent = user.emoji || '👤';
    showView('chat-view');

    // V2: Listen for Presence
    db.ref(`users/${friendUid}`).on('value', snap => {
        const data = snap.val();
        const statusEl = document.getElementById('chat-header-status');
        if (data.status === 'online') {
            statusEl.textContent = 'online';
            statusEl.style.color = 'var(--wa-accent-blue)';
        } else {
            const time = data.lastSeen ? new Date(data.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            statusEl.textContent = data.lastSeen ? `last seen at ${time}` : 'offline';
            statusEl.style.color = 'grey';
        }
    });

    // Chat ID for message loading
    const chatId = getChatId(currentUser.uid, friendUid);

    // V2: Listen for Typing - REMOVED (V3.6)
    /*
    db.ref(`typing/${chatId}/${friendUid}`).on('value', snap => {
        const isTyping = snap.val();
        if (isTyping) {
            showTypingBubble();
        } else {
            hideTypingBubble();
        }
    });
    */

    // Load Messages
    chatMessages.innerHTML = ''; // Clear old

    // Reset unread
    db.ref(`unreadCounts/${currentUser.uid}/${chatId}`).set(0);

    // V2: Check Deleted Messages for Me
    db.ref(`deletedMessages/${currentUser.uid}/${chatId}`).once('value')
        .then(deletedSnap => deletedSnap.val() || {})
        .catch(err => {
            console.error("Error fetching deleted messages permissions:", err);
            return {}; // Fallback to empty if permission denied or error
        })
        .then(deletedIds => {
            db.ref(`messages/${chatId}`).limitToLast(50).on('child_added', snapshot => {
                if (deletedIds[snapshot.key]) return; // Skip if deleted for me

                const msg = snapshot.val();
                // V2: Mark as Seen if not me
                if (msg.sender !== currentUser.uid && msg.status !== 'seen') {
                    db.ref(`messages/${chatId}/${snapshot.key}`).update({ status: 'seen' });
                }
                displayMessage(msg, snapshot.key);
            });

            // V2: Listen for changes (Read receipts, Delete for Everyone)
            db.ref(`messages/${chatId}`).limitToLast(50).on('child_changed', snapshot => {
                const msg = snapshot.val();
                const el = document.getElementById(`msg-${snapshot.key}`);
                if (el) {
                    // Update ticks or content
                    if (msg.text === "🚫 This message was deleted") {
                        el.querySelector('.message-text-content').textContent = msg.text;
                        el.style.fontStyle = 'italic';
                        el.style.color = 'grey';
                    }
                    // Update status tick
                    const tick = el.querySelector('.message-status');
                    if (tick && msg.sender === currentUser.uid) {
                        tick.textContent = getStatusTick(msg.status);
                        tick.className = `message-status status-${msg.status}`;
                    }

                    // V2.2 Fix: Live Reaction Update
                    let reactionDiv = el.querySelector('.message-reaction');
                    if (msg.reaction) {
                        if (reactionDiv) {
                            reactionDiv.textContent = msg.reaction;
                        } else {
                            reactionDiv = document.createElement('div');
                            reactionDiv.className = 'message-reaction';
                            reactionDiv.id = `reaction-${snapshot.key}`;
                            reactionDiv.textContent = msg.reaction;
                            el.appendChild(reactionDiv);
                        }
                    } else if (reactionDiv) {
                        reactionDiv.remove(); // Remove if reaction was removed (optional future proofing)
                    }
                }
            });
        });
}

function getStatusTick(status) {
    if (status === 'sent') return '✓';
    if (status === 'delivered') return '✓✓'; // Grey double
    if (status === 'seen') return '✓✓'; // Blue double (via CSS)
    return '🕒';
}

function displayMessage(msg, key) {
    const div = document.createElement('div');
    const isMe = msg.sender === currentUser.uid;
    div.className = `message-bubble ${isMe ? 'message-sent' : 'message-received'}`;
    div.id = `msg-${key}`;

    // Context Menu Logic
    div.oncontextmenu = (e) => showContextMenu(e, key, isMe, msg.text);
    // Long press for mobile
    let pressTimer;
    div.ontouchstart = (e) => { pressTimer = setTimeout(() => showContextMenu(e, key, isMe, msg.text), 500); };
    div.ontouchend = () => clearTimeout(pressTimer);

    // V2: Reply Preview
    let replyHTML = '';
    if (msg.replyTo) {
        replyHTML = `
            <div class="message-reply-preview" onclick="scrollToMessage('${msg.replyTo.id}')">
                <div class="reply-preview-name">${msg.replyTo.senderName}</div>
                <div class="reply-text">${msg.replyTo.text}</div>
            </div>
        `;
    }

    // V2: Context Menu Logic (Right Click)
    // Use encodeURIComponent to safely pass text string in onclick handlers
    const safeText = encodeURIComponent(msg.text);
    div.oncontextmenu = (e) => showContextMenu(e, key, isMe, safeText);

    // Long press for mobile
    div.ontouchstart = (e) => { pressTimer = setTimeout(() => showContextMenu(e, key, isMe, safeText), 500); };
    div.ontouchend = () => clearTimeout(pressTimer);

    // V2.1: Message Buttons (Reply, React, 3-Dots)
    const actionsHTML = `
        <div class="message-actions-bar">
            <button class="mini-btn" title="Reply" onclick="setupReply('${key}', decodeURIComponent('${safeText}'), '${isMe ? 'You' : (currentChatPartner.name || currentChatPartner.username)}')">↩️</button>
            <div class="relative-container" style="display:inline-block">
                <button class="mini-btn" title="React" onclick="toggleReactionPicker('${key}')">😀</button>
                <div id="reaction-picker-${key}" class="reaction-picker hidden">
                    <span class="reaction-option" onclick="reactToMessage('${key}', '👍')">👍</span>
                    <span class="reaction-option" onclick="reactToMessage('${key}', '❤️')">❤️</span>
                    <span class="reaction-option" onclick="reactToMessage('${key}', '😂')">😂</span>
                    <span class="reaction-option" onclick="reactToMessage('${key}', '😮')">😮</span>
                    <span class="reaction-option" onclick="reactToMessage('${key}', '😢')">😢</span>
                    <span class="reaction-option" onclick="reactToMessage('${key}', '🙏')">🙏</span>
                </div>
            </div>
            <button class="mini-btn" title="More" onclick="showContextMenu(event, '${key}', ${isMe}, '${safeText}')">⋮</button>
        </div>
    `;

    // V2: Reaction Display
    let reactionHTML = '';
    if (msg.reaction) {
        reactionHTML = `<div class="message-reaction" id="reaction-${key}">${msg.reaction}</div>`;
    }

    // V2: Message Status Tick
    let tickHTML = '';
    if (isMe) {
        tickHTML = `<span class="message-status status-${msg.status || 'sent'}">${getStatusTick(msg.status || 'sent')}</span>`;
    }

    div.innerHTML = `
        ${actionsHTML}
        ${replyHTML}
        <span class="message-text-content">${msg.text}</span>
        <span class="message-time">
            ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            ${tickHTML}
        </span>
        ${reactionHTML}
    `;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// V2: Typing Indicator Input Logic
chatInput.addEventListener('input', () => {
    if (!currentChatPartner) return;
    // const chatId = getChatId(currentUser.uid, currentChatPartner.uid);

    // Typing Logic REMOVED (V3.6)
    /*
    if (chatInput.value.trim() === '') {
        db.ref(`typing/${chatId}/${currentUser.uid}`).remove();
        if (typingTimeout) clearTimeout(typingTimeout);
    } else {
        db.ref(`typing/${chatId}/${currentUser.uid}`).set(true);
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            db.ref(`typing/${chatId}/${currentUser.uid}`).remove();
        }, 2000);
    }
    */

    // V3.5 Fix: Scroll to bottom on type
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Send Message
chatSendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !currentChatPartner) return;

    const chatId = getChatId(currentUser.uid, currentChatPartner.uid);
    const msgData = {
        sender: currentUser.uid,
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: 'sent', // V2: Status
    };

    // V2: Reply Data
    if (currentReply) {
        msgData.replyTo = {
            id: currentReply.id,
            text: currentReply.text,
            senderName: currentReply.senderName
        };
        cancelReply();
    }

    db.ref(`messages/${chatId}`).push(msgData).catch(error => {
        alert("Failed to send: " + error.message);
        console.error("Msg Error:", error);
    });

    // Increment unread for recipient
    const recipientRef = db.ref(`unreadCounts/${currentChatPartner.uid}/${chatId}`);
    recipientRef.transaction(count => (count || 0) + 1);

    chatInput.value = '';
    // db.ref(`typing/${chatId}/${currentUser.uid}`).remove(); // Stop typing immediately
}

// V2: Reply & Delete Functions
function showContextMenu(e, key, isMe, encodedText) {
    if (e) {
        e.preventDefault();
        e.stopPropagation(); // Stop bubbling
    }

    // Decode text if it was URI encoded (to handle quotes safely)
    const text = decodeURIComponent(encodedText);

    const menu = document.getElementById('msg-context-menu');

    // Position menu based on click, but keep within viewport
    let x = e.clientX;
    let y = e.clientY;

    // Adjust if too close to edges (Simple boundary check)
    if (x + 150 > window.innerWidth) x = window.innerWidth - 160;
    if (y + 150 > window.innerHeight) y = window.innerHeight - 160;

    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    menu.classList.remove('hidden');

    document.getElementById('ctx-reply').onclick = () => {
        setupReply(key, text, isMe ? 'You' : currentChatPartner.name);
        menu.classList.add('hidden');
    };

    document.getElementById('ctx-delete-me').onclick = () => {
        deleteMessage(key, false);
        menu.classList.add('hidden');
    };

    const delEveryoneBtn = document.getElementById('ctx-delete-everyone');
    if (isMe) {
        delEveryoneBtn.classList.remove('hidden');
        delEveryoneBtn.onclick = () => {
            deleteMessage(key, true);
            menu.classList.add('hidden');
        };
    } else {
        delEveryoneBtn.classList.add('hidden');
    }

    document.getElementById('ctx-cancel').onclick = () => menu.classList.add('hidden');
}

// Close menu on click elsewhere
document.addEventListener('click', (e) => {
    // Hide context menu if clicking outside
    const menu = document.getElementById('msg-context-menu');
    if (!menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
});

function setupReply(id, text, name) {
    currentReply = { id, text, senderName: name };
    document.getElementById('reply-context').classList.remove('hidden');
    document.getElementById('reply-to-name').textContent = `Replying to ${name}`;
    document.getElementById('reply-to-text').textContent = text;
    document.getElementById('chat-input').focus();
}

function cancelReply() {
    currentReply = null;
    document.getElementById('reply-context').classList.add('hidden');
}
document.getElementById('cancel-reply-btn').onclick = cancelReply;

function deleteMessage(key, forEveryone) {
    const chatId = getChatId(currentUser.uid, currentChatPartner.uid);

    if (forEveryone) {
        // Update DB "text" to "deleted"
        db.ref(`messages/${chatId}/${key}`).update({
            text: "🚫 This message was deleted",
            deletedBy: currentUser.uid
        });
    } else {
        // Delete for Me (Local Filter)
        db.ref(`deletedMessages/${currentUser.uid}/${chatId}/${key}`).set(true);
        // Remove from UI
        const el = document.getElementById(`msg-${key}`);
        if (el) el.remove();
    }
}

function scrollToMessage(key) {
    const el = document.getElementById(`msg-${key}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.backgroundColor = 'rgba(0,0,0,0.1)';
        setTimeout(() => el.style.backgroundColor = '', 1000);
    }
}

document.getElementById('chat-back-btn').addEventListener('click', () => {
    showView('main-view');
    // Remove listener for current chat to avoid duplicates if reopened
    if (currentChatPartner) {
        const chatId = getChatId(currentUser.uid, currentChatPartner.uid);
        db.ref(`messages/${chatId}`).off();
        currentChatPartner = null;
    }
});

// 8. WEBRTC CALLING LOGIC REMOVED (V3.1)
// User requested removal of call features.

/*
document.getElementById('voice-call-btn').onclick = () => startCall(false);
document.getElementById('video-call-btn').onclick = () => startCall(true);

document.getElementById('end-video-call-btn').onclick = endCall;
document.getElementById('end-voice-call-btn').onclick = endCall;
document.getElementById('reject-call-btn').onclick = () => {
    // Just remove the call entry
    if (currentCallId) {
        db.ref(`calls/${currentUser.uid}`).remove();
    }
    hideModal('incoming-call-modal');
    ringtone.pause();
    ringtone.currentTime = 0;
};
document.getElementById('accept-call-btn').onclick = acceptCall;
*/

async function startCall(video) {
    if (!currentChatPartner) return;

    isVideoCall = video;
    currentCallId = currentChatPartner.uid; // Key for the call is the RECIPIENT's uid for now in 'calls' node logic

    try {
        // 1. Get User Media
        const stream = await navigator.mediaDevices.getUserMedia({ video: video, audio: true });
        localStream = stream;

        // UI Setup
        if (video) {
            showView('video-call-view');
            document.getElementById('local-video').srcObject = stream;
            document.getElementById('video-caller-name').textContent = currentChatPartner.name;
        } else {
            showView('voice-call-view');
            document.getElementById('voice-caller-name').textContent = currentChatPartner.name;
            document.getElementById('voice-caller-avatar').textContent = currentChatPartner.emoji || '👤';
        }

        // 2. Create Peer Connection
        createPeerConnection();

        // 3. Add Tracks
        stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

        // 4. Create Offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // 5. Send Offer to DB
        // Structure: calls/{recipient_uid}
        const callData = {
            caller: currentUser.uid,
            callerName: currentUser.displayName || 'Unknown', // Using placeholder if name not locally avail
            offer: {
                type: offer.type,
                sdp: offer.sdp
            },
            type: video ? 'video' : 'voice',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        // We use the RECIPIENT'S ID as the key so they can listen to it
        await db.ref(`calls/${currentChatPartner.uid}`).set(callData);

        // V2.5 Fix: Listen for rejection/end by Callee
        // If the 'calls' node is removed, it means they rejected or ended it.
        const callRef = db.ref(`calls/${currentChatPartner.uid}`);
        callRef.on('value', snapshot => {
            const data = snapshot.val();
            if (!data && currentCallId) {
                // Call ended remotely
                endCall();
            }
        });

    } catch (err) {
        console.error("Error starting call:", err);
        alert("Could not access camera/microphone.");
        endCall();
    }
}

function listenForIncomingCalls() {
    db.ref(`calls/${currentUser.uid}`).on('value', snapshot => {
        const data = snapshot.val();
        if (data && data.offer && !peerConnection) {
            // Incoming Call!
            currentCallId = currentUser.uid; // The call node is MY uid

            // Get caller info
            db.ref(`users/${data.caller}`).once('value').then(userSnap => {
                const user = userSnap.val();
                document.getElementById('incoming-caller-name').textContent = user.name;
                document.getElementById('incoming-call-avatar').textContent = user.emoji || '👤';
                document.getElementById('incoming-call-type').textContent = `Incoming ${data.type} call...`;

                showModal('incoming-call-modal');
                ringtone.play();

                // Check if blocked
                checkIfBlocked(data.caller).then(blocked => {
                    if (blocked) {
                        // Auto reject
                        db.ref(`calls/${currentUser.uid}`).remove();
                        hideModal('incoming-call-modal');
                        ringtone.pause();
                    }
                });
            });
        } else if (!data && (document.getElementById('incoming-call-modal').classList.contains('hidden') === false)) {
            // Call cancelled by caller
            hideModal('incoming-call-modal');
            ringtone.pause();
            ringtone.currentTime = 0;
        } else if (!data && peerConnection) {
            // Call ended remotely while active
            endCall();
        }
    });
}

async function acceptCall() {
    hideModal('incoming-call-modal');
    ringtone.pause();
    ringtone.currentTime = 0;

    const snapshot = await db.ref(`calls/${currentUser.uid}`).once('value');
    const data = snapshot.val();
    if (!data) return; // Call gone

    isVideoCall = data.type === 'video';

    try {
        // 1. Get Media
        const stream = await navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true });
        localStream = stream;

        // UI
        if (isVideoCall) {
            showView('video-call-view');
            document.getElementById('local-video').srcObject = stream;
        } else {
            showView('voice-call-view');
        }

        // 2. Create PC
        const buffer = createPeerConnection();

        // 3. Add Tracks
        stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

        // 4. Set Remote Desc (Offer)
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

        // V2.6 Fix: Flush Buffer for Receiver
        console.log("Receiver: Remote Description set. Flushing buffer...", buffer.length);
        while (buffer.length > 0) {
            const candidate = buffer.shift();
            peerConnection.addIceCandidate(candidate).catch(e => console.error("Error adding buffered candidate", e));
        }

        // 5. Create Answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // 6. Send Answer
        await db.ref(`calls/${currentUser.uid}/answer`).set({
            type: answer.type,
            sdp: answer.sdp
        });

    } catch (err) {
        console.error("Error accepting call", err);
        endCall();
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    const iceCandidateBuffer = []; // V2.5 Fix: Buffer

    // ICE Candidates
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            let path;
            if (currentUser.uid === currentCallId) {
                // I am the RECEIVER (My ID is the room)
                path = `iceCandidates/${currentUser.uid}/callee`;
            } else {
                // I am the CALLER (Partner ID is the room)
                path = `iceCandidates/${currentCallId}/caller`;
            }
            db.ref(path).push(event.candidate.toJSON());
        }
    };

    // Track Remote Stream
    peerConnection.ontrack = event => {
        const stream = event.streams[0];
        if (!remoteStream) {
            remoteStream = stream;
            document.getElementById('remote-video').srcObject = stream;
            document.getElementById('remote-audio').srcObject = stream;
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            endCall();
        }
    };

    // Listen for Remote ICE Candidates
    listenForRemoteCandidates(iceCandidateBuffer);

    // If I am caller, listen for Answer
    if (currentUser.uid !== currentCallId) {
        db.ref(`calls/${currentCallId}/answer`).on('value', snapshot => {
            const data = snapshot.val();
            if (data && !peerConnection.currentRemoteDescription) {
                const answer = new RTCSessionDescription(data);
                peerConnection.setRemoteDescription(answer).then(() => {
                    // Reduce buffer
                    while (iceCandidateBuffer.length > 0) {
                        const candidate = iceCandidateBuffer.shift();
                        peerConnection.addIceCandidate(candidate);
                        console.log("Added buffered candidate");
                    }
                });
            }
        });
    }
}

function listenForRemoteCandidates(buffer) {
    let path;
    if (currentUser.uid === currentCallId) {
        // I am RECEIVER, listen to CALLER candidates
        path = `iceCandidates/${currentUser.uid}/caller`;
    } else {
        // I am CALLER, listen to CALLEE candidates
        path = `iceCandidates/${currentCallId}/callee`;
    }

    db.ref(path).on('child_added', snapshot => {
        const candidate = snapshot.val();
        if (peerConnection) {
            const ice = new RTCIceCandidate(candidate);
            if (peerConnection.remoteDescription) {
                peerConnection.addIceCandidate(ice);
            } else {
                // Buffer it!
                buffer.push(ice);
                console.log("Buffering candidate...");
            }
        }
    });
}

// V2.4 Fix: Enhanced End Call Logic
function endCall() {
    // Cleanup WebRTC
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    remoteStream = null;

    // Cleanup DB
    const roomID = (currentUser.uid === currentCallId) ? currentUser.uid : currentCallId;
    if (roomID) {
        // Turn off listeners first!
        db.ref(`calls/${roomID}`).off();
        db.ref(`calls/${roomID}/answer`).off();
        db.ref(`iceCandidates/${roomID}`).remove();
        db.ref(`calls/${roomID}`).remove();
    }

    // Stop Ringtone
    ringtone.pause();
    ringtone.currentTime = 0;

    // UI Reset - KEY FIX: Explicitly show prev view
    document.querySelectorAll('.call-view').forEach(el => el.classList.add('hidden'));
    hideModal('incoming-call-modal');

    // Resume Chat or Main
    if (currentChatPartner) {
        showView('chat-view');
    } else {
        showView('main-view');
    }

    currentCallId = null;
}


// V2: Top Menu Logic
document.getElementById('chat-more-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('chat-dropdown-menu');
    menu.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#chat-more-btn')) {
        document.getElementById('chat-dropdown-menu').classList.add('hidden');
    }
});

document.getElementById('menu-view-profile').onclick = () => {
    if (!currentChatPartner) return;
    alert(`User: ${currentChatPartner.name}\nUsername: @${currentChatPartner.username}`);
};

document.getElementById('menu-block-user').onclick = () => {
    if (!currentChatPartner) return;
    if (confirm(`Block ${currentChatPartner.name}?`)) {
        db.ref(`users/${currentUser.uid}/blocked/${currentChatPartner.uid}`).set(true)
            .then(() => {
                alert("User blocked.");
                showView('main-view');
            });
    }
};

// V2.1: React to Message (Optimistic UI)
window.reactToMessage = function (key, emoji) {
    if (!currentChatPartner) return;

    // UI Feedback immediately
    const msgEl = document.getElementById(`msg-${key}`);
    const existing = msgEl.querySelector('.message-reaction');

    // Hide picker
    const picker = document.getElementById(`reaction-picker-${key}`);
    picker.classList.add('hidden');
    const bar = picker.closest('.message-actions-bar');
    if (bar) bar.classList.remove('active');

    if (existing) {
        existing.textContent = emoji;
    } else {
        const span = document.createElement('div');
        span.className = 'message-reaction';
        span.id = `reaction-${key}`;
        span.textContent = emoji;
        msgEl.appendChild(span);
    }

    const chatId = getChatId(currentUser.uid, currentChatPartner.uid);
    db.ref(`messages/${chatId}/${key}`).update({ reaction: emoji });
};

// V2.4 Fix: Smart Emoji Picker Positioning
// V3.3 Fix: Robust Emoji Picker Positioning (JS Calculation)
// V3.5 Fix: Modal Emoji Picker (Centered Fixed Position)
window.toggleReactionPicker = function (key) {
    const picker = document.getElementById(`reaction-picker-${key}`);

    // Hide all others and remove active class
    document.querySelectorAll('.reaction-picker').forEach(el => {
        if (el.id !== `reaction-picker-${key}`) {
            el.classList.add('hidden');
            el.classList.remove('reaction-picker-modal'); // Clear modal class from others
            const bar = el.closest('.message-actions-bar');
            if (bar) bar.classList.remove('active');
        }
    });

    // Toggle current
    const wasHidden = picker.classList.contains('hidden');

    if (wasHidden) {
        picker.classList.remove('hidden');
        picker.classList.add('reaction-picker-modal'); // Apply modal style
        picker.style.left = '';
        picker.style.right = '';
        picker.style.transform = ''; // reset inline styles

        // Active state for parent bar
        const parentBar = picker.closest('.message-actions-bar');
        if (parentBar) parentBar.classList.add('active');

    } else {
        picker.classList.add('hidden');
        picker.classList.remove('reaction-picker-modal');

        // Remove active state
        const parentBar = picker.closest('.message-actions-bar');
        if (parentBar) parentBar.classList.remove('active');
    }
};

// Close pickers on click elsewhere
document.addEventListener('click', (e) => {
    // V3.3 Fix: Stop propagation if clicking inside picker to prevent closing
    if (e.target.closest('.reaction-picker')) return;

    if (!e.target.closest('.relative-container')) {
        document.querySelectorAll('.reaction-picker').forEach(el => {
            el.classList.add('hidden');
            const bar = el.closest('.message-actions-bar');
            if (bar) bar.classList.remove('active');
        });
    }
});

// ==========================================
// 8. BLOCKING & EXTRA UI
// ==========================================

function checkIfBlocked(targetUid) {
    return db.ref(`users/${currentUser.uid}/blocked/${targetUid}`).once('value')
        .then(snap => snap.exists());
}

// Menu Nav
document.getElementById('nav-home').onclick = () => showPanel('home-content');
document.getElementById('nav-notifications').onclick = () => showPanel('notifications-content');
document.getElementById('nav-calls').onclick = () => showPanel('calls-content');

document.getElementById('menu-btn').addEventListener('click', () => {
    showModal('profile-view-modal');
    loadBlockedList();
});

document.getElementById('close-profile-modal').onclick = () => hideModal('profile-view-modal');

function loadBlockedList() {
    const list = document.getElementById('blocked-users-list');
    list.innerHTML = '';

    db.ref(`users/${currentUser.uid}/blocked`).once('value', snapshot => {
        if (!snapshot.exists()) {
            list.innerHTML = '<p style="color:grey; font-size:0.9rem;">No blocked users.</p>';
            return;
        }

        snapshot.forEach(child => {
            const blockedUid = child.key;
            db.ref(`users/${blockedUid}`).once('value').then(userSnap => {
                const user = userSnap.val();
                const div = document.createElement('div');
                div.className = 'list-item';
                div.innerHTML = `
                    <div class="item-details">${user.name} (@${user.username})</div>
                    <button class="secondary-btn" style="padding:5px 10px; font-size:0.8rem;" onclick="unblockUser('${blockedUid}')">Unblock</button>
                `;
                list.appendChild(div);
            });
        });
    });
}

window.unblockUser = function (uid) {
    db.ref(`users/${currentUser.uid}/blocked/${uid}`).remove().then(() => loadBlockedList());
};

// Draggable Local Video
const dragItem = document.getElementById("local-video");
let active = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

dragItem.addEventListener("mousedown", dragStart, false);
document.addEventListener("mouseup", dragEnd, false);
document.addEventListener("mousemove", drag, false);

function dragStart(e) {
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    if (e.target === dragItem) active = true;
}

function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    active = false;
}

function drag(e) {
    if (active) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        dragItem.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }
}

// V3.4 Typing Bubble Helpers
function showTypingBubble() {
    let bubble = document.getElementById('typing-bubble');
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'typing-bubble';
        bubble.className = 'message-bubble message-received typing-bubble';
        bubble.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

        const chatMessages = document.getElementById('chat-messages');
        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function hideTypingBubble() {
    const bubble = document.getElementById('typing-bubble');
    if (bubble) bubble.remove();
}

// V3.4 Typing Bubble Helpers
function showTypingBubble() {
    let bubble = document.getElementById('typing-bubble');
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'typing-bubble';
        bubble.className = 'message-bubble message-received typing-bubble';
        bubble.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

        const chatMessages = document.getElementById('chat-messages');
        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function hideTypingBubble() {
    const bubble = document.getElementById('typing-bubble');
    if (bubble) bubble.remove();
}
