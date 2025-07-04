let { Ollama } = require('ollama');
let ollama = null;
const { BrowserWindow, ipcMain } = require('electron');
const { getSystemPrompt } = require('./prompts');

let conversationHistory = [];
let currentModel = 'llama3';
let currentHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
let currentSessionId = null;

function createClient(host) {
    currentHost = host || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    ollama = new Ollama({ host: currentHost });
}

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function initializeNewSession() {
    currentSessionId = Date.now().toString();
    conversationHistory = [];
    console.log('New conversation session started:', currentSessionId);
}

function saveConversationTurn(userMessage, aiResponse) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const conversationTurn = {
        timestamp: Date.now(),
        transcription: userMessage.trim(),
        ai_response: aiResponse.trim(),
    };

    conversationHistory.push(conversationTurn);
    console.log('Saved conversation turn:', conversationTurn);

    sendToRenderer('save-conversation-turn', {
        sessionId: currentSessionId,
        turn: conversationTurn,
        fullHistory: conversationHistory,
    });
}

function getCurrentSessionData() {
    return {
        sessionId: currentSessionId,
        history: conversationHistory,
    };
}

async function initializeOllamaSession(host = currentHost, model = 'llama3', customPrompt = '', profile = 'interview') {
    createClient(host);
    currentModel = model;
    initializeNewSession();
    const systemPrompt = getSystemPrompt(profile, customPrompt, false);
    conversationHistory.push({ role: 'system', content: systemPrompt });
    sendToRenderer('update-status', 'Ollama session ready');
    return true;
}

async function chatWithOllama(messages) {
    const response = await ollama.chat({ model: currentModel, messages });
    return response.message.content;
}

async function handleTextMessage(text) {
    const messages = conversationHistory.concat([{ role: 'user', content: text }]);
    const reply = await chatWithOllama(messages);
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory.push({ role: 'assistant', content: reply });
    saveConversationTurn(text, reply);
    sendToRenderer('update-response', reply);
    return { success: true };
}

async function handleImageContent(data) {
    const messages = conversationHistory.concat([{ role: 'user', content: '', images: [data] }]);
    const reply = await chatWithOllama(messages);
    conversationHistory.push({ role: 'user', content: '', images: [data] });
    conversationHistory.push({ role: 'assistant', content: reply });
    saveConversationTurn('[image]', reply);
    sendToRenderer('update-response', reply);
    return { success: true };
}

function setupOllamaIpcHandlers(ollamaSessionRef) {
    ipcMain.handle('initialize-ollama', async (event, host, model, customPrompt, profile) => {
        const ok = await initializeOllamaSession(host, model, customPrompt, profile);
        if (ok) ollamaSessionRef.current = true;
        return ok;
    });

    ipcMain.handle('send-text-message', async (event, text) => {
        try {
            return await handleTextMessage(text);
        } catch (err) {
            console.error('Error sending text to Ollama:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('send-image-content', async (event, { data }) => {
        try {
            return await handleImageContent(data);
        } catch (err) {
            console.error('Error sending image to Ollama:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('send-audio-content', async () => {
        return { success: false, error: 'Audio not supported with Ollama integration' };
    });

    ipcMain.handle('close-session', async () => {
        ollamaSessionRef.current = null;
        conversationHistory = [];
        return { success: true };
    });

    ipcMain.handle('get-current-session', async () => {
        return { success: true, data: getCurrentSessionData() };
    });

    ipcMain.handle('start-new-session', async () => {
        initializeNewSession();
        return { success: true, sessionId: currentSessionId };
    });
}

module.exports = {
    setupOllamaIpcHandlers,
    initializeOllamaSession,
    sendToRenderer,
    initializeNewSession,
    saveConversationTurn,
    getCurrentSessionData,
};
