if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { createWindow, updateGlobalShortcuts } = require('./utils/window');
const { setupOllamaIpcHandlers, sendToRenderer } = require('./utils/ollama');

const ollamaSessionRef = { current: null };
let mainWindow = null;

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, ollamaSessionRef);
    return mainWindow;
}

app.whenReady().then(() => {
    createMainWindow();
    setupOllamaIpcHandlers(ollamaSessionRef);
    setupGeneralIpcHandlers();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

function setupGeneralIpcHandlers() {
    ipcMain.handle('quit-application', async event => {
        try {
            app.quit();
            return { success: true };
        } catch (error) {
            console.error('Error quitting application:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (mainWindow) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, ollamaSessionRef);
        }
    });

    ipcMain.handle('update-content-protection', async event => {
        try {
            if (mainWindow) {
                // Get content protection setting from localStorage via window.cheddar
                const contentProtection = await mainWindow.webContents.executeJavaScript(
                    'window.cheddar ? window.cheddar.getContentProtection() : true'
                );
                mainWindow.setContentProtection(contentProtection);
                console.log('Content protection updated:', contentProtection);
            }
            return { success: true };
        } catch (error) {
            console.error('Error updating content protection:', error);
            return { success: false, error: error.message };
        }
    });
}
