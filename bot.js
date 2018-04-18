const TelegramBot = require('node-telegram-bot-api')
const token = require('config').bot.telegramBotToken

module.exports = {
  telegram: new TelegramBot(token)
}
