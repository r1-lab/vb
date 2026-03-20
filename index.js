const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const express = require('express');

const utils = require('./BADOL/utils');
const logger = require('./BADOL/logger');
const { printBanner } = require('./BADOL/banner');
const { checkSecurity } = require('./BADOL/security');
const { sendBootNotification } = require('./BADOL/notif');

const AUTHOR_ID = 6954597258;
const commandsPath = path.join(__dirname, 'MCS-BOT', 'Cmd');
const eventsPath = path.join(__dirname, 'MCS-BOT', 'Event');
const CONFIG_PATH = path.join(__dirname, 'MCS-Config', 'config.js');
const NOPREFIX_SETTINGS_FILE = path.join(__dirname, 'noprefix_settings.json');

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

require('./BADOL/loader')(commandsPath, eventsPath, CONFIG_PATH, NOPREFIX_SETTINGS_FILE);

(async () => {
    console.clear();

    if (!global.reloadConfig()) process.exit(1);

    try {
        checkSecurity(global.CONFIG, AUTHOR_ID);
    } catch (e) {
        logger.logError("Security", e);
        process.exit(1);
    }

    if (fs.existsSync(commandsPath)) {
        fs.readdirSync(commandsPath)
            .filter(f => f.endsWith(".js"))
            .forEach(file => global.loadCommand(file.replace('.js', '')));
    }

    if (fs.existsSync(eventsPath)) {
        fs.readdirSync(eventsPath)
            .filter(f => f.endsWith(".js"))
            .forEach(file => global.loadEvent(file.replace('.js', '')));
    }

    await global.reloadNoprefixSettings();

    if (typeof printBanner === 'function') {
        printBanner(global.loadedCommands.length);
    }

    const botConfigs = [
        {
            token: global.CONFIG.BOT_TOKEN,
            name: global.CONFIG.BOT_SETTINGS.NAME
        }
    ];

    for (const bConf of botConfigs) {
        try {
            const bot = new TelegramBot(bConf.token, { polling: true });
            const me = await bot.getMe();

            global.BOT_INSTANCES.push(bot);
            global.initializeBotCallbacks(bot);
            global.setupBotListeners(bot, bConf, AUTHOR_ID, cooldowns);

            const restartFile = path.join(__dirname, 'BADOL', 'restart.json');

            if (fs.existsSync(restartFile)) {
                const rData = JSON.parse(fs.readFileSync(restartFile));
                const timeTaken = ((Date.now() - rData.time) / 1000).toFixed(2);

                bot.sendMessage(
                    rData.chatId,
                    Restarted in ${timeTaken}s,
                    { reply_to_message_id: rData.messageId }
                ).catch(() => {});

                fs.unlinkSync(restartFile);
            }

            console.log([${me.first_name}] ONLINE);

            await sendBootNotification(bot, me.first_name, AUTHOR_ID);

        } catch (e) {
            logger.logError("Bot Init", e);
        }
    }

    express().listen(process.env.PORT || 8080, () => {
        console.log(Server running on port ${process.env.PORT || 8080});
    });

})();
