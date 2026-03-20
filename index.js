const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const express = require('express');
const utils = require('./BADOL/utils');
const logger = require('./BADOL/logger'); 
const { printBanner } = require('./BADOL/banner');
const { checkSecurity } = require('./BADOL/security'); 
const { sendBootNotification } = require('./BADOL/notif');

// --- 🛡️ CONFIGURATION ---
const AUTHOR_ID = 6954597258; 
const commandsPath = path.join(__dirname, 'MCS-BOT', 'Cmd');
const eventsPath = path.join(__dirname, 'MCS-BOT', 'Event');
const CONFIG_PATH = path.join(__dirname, 'MCS-Config', 'config.js');
const NOPREFIX_SETTINGS_FILE = path.join(__dirname, 'noprefix_settings.json');

// --- 🌍 GLOBAL VARIABLES ---
global.botStartTime = Date.now();
global.activeEmails = {};
global.COMMANDS = {}; 
global.EVENTS = {}; 
global.ALIASES = {}; 
global.loadedCommands = []; 
global.utils = utils; 
global.BOT_INSTANCES = []; 
global.isNoprefixActive = true; 
const cooldowns = new Map();

// --- 🚀 LOADER ---
require('./BADOL/loader')(commandsPath, eventsPath, CONFIG_PATH, NOPREFIX_SETTINGS_FILE);

// --- 🛡️ BOOT SEQUENCE ---
(async () => {
    console.clear();
    console.log(\x1b[36m[ SYSTEM ] Scanning MCS-BOT folders...\x1b[0m);

    if (!global.reloadConfig()) process.exit(1);
    
    // সিকিউরিটি চেক
    try { checkSecurity(global.CONFIG, AUTHOR_ID); } 
    catch (e) { logger.logError("Security", e); process.exit(1); }

    // কমান্ড ও ইভেন্ট লোড করা
    if (fs.existsSync(commandsPath)) {
        fs.readdirSync(commandsPath).filter(f => f.endsWith(".js")).forEach(file => {
            global.loadCommand(file.replace('.js', ''));
        });
    }
    if (fs.existsSync(eventsPath)) {
        fs.readdirSync(eventsPath).filter(f => f.endsWith(".js")).forEach(file => {
            global.loadEvent(file.replace('.js', ''));
        });
    }

    await global.reloadNoprefixSettings();
    if (typeof printBanner === 'function') printBanner(global.loadedCommands.length);

    // বট ইনিশিয়ালাইজেশন
    const botConfigs = [{ token: global.CONFIG.BOT_TOKEN, name: global.CONFIG.BOT_SETTINGS.NAME }];

    for (const bConf of botConfigs) {
        try {
            const bot = new TelegramBot(bConf.token, { polling: true });
            const me = await bot.getMe();
            
            global.BOT_INSTANCES.push(bot); // ইন্সট্যান্স সেভ রাখা
            global.initializeBotCallbacks(bot);
            global.setupBotListeners(bot, bConf, AUTHOR_ID, cooldowns);

            // রিস্টার্ট মেসেজ চেক
            const restartFile = path.join(__dirname, 'BADOL', 'restart.json');
            if (fs.existsSync(restartFile)) {
                const rData = JSON.parse(fs.readFileSync(restartFile));
                const timeTaken = ((Date.now() - rData.time) / 1000).toFixed(2);
                bot.sendMessage(rData.chatId, ✅ **বট সফলভাবে রিস্টার্ট হয়েছে!**\n⏱ সময় লেগেছে: ${timeTaken}s, { reply_to_message_id: rData.messageId }).catch(() => {});
                fs.unlinkSync(restartFile);
            }

            console.log(\n ${global.CONFIG.DESIGN.TICK || '✔'} [${me.first_name}] - ONLINE);
            await sendBootNotification(bot, me.first_name, AUTHOR_ID);
        } catch (e) { logger.logError("Bot Init", e); }
    }

    express().listen(process.env.PORT || 8080, () => {
        console.log(\x1b[32m[ SERVER ] Live on port ${process.env.PORT || 8080}\x1b[0m);
    });
})();
