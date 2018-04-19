const fs = require('fs')
const {promisify} = require('util')
const readline = require('readline')
const _ = require('lodash')
const {google} = require('googleapis')
const schedule = require('node-schedule')
const moment = require('moment')
const config = require('config')
const telegramBot = require('./bot').telegram

const OAuth2Client = google.auth.OAuth2
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']
const TOKEN_PATH = 'credentials.json'
const CLIENT_SECRET_PATH = 'client_secret.json'

const readFileAsync = promisify(fs.readFile)

const getAccessToken = oAuth2Client => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  })
  console.log('Authorize this app by visiting this url:', authUrl)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close()
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return new Error('getAccessToken err')
      oAuth2Client.setCredentials(token)
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err)
        console.log('Token stored to', TOKEN_PATH)
      })
      return oAuth2Client
    })
  })
}

const getDayOfWeekString = dayNumber => {
  switch (dayNumber) {
    case '0':
      return '일요일'
    case '1':
      return '월요일'
    case '2':
      return '화요일'
    case '3':
      return '수요일'
    case '4':
      return '목요일'
    case '5':
      return '금요일'
    case '6':
      return '토요일'
    default:
      return '이상한 요일'
  }
}

exports.run = async () => {
  const content = await readFileAsync(CLIENT_SECRET_PATH)
  const {client_secret, client_id, redirect_uris} = JSON.parse(content).installed

  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0])

  let token
  try {
    token = await readFileAsync(TOKEN_PATH)
    oAuth2Client.setCredentials(JSON.parse(token))
  } catch (err) {
    token = getAccessToken(oAuth2Client)
  }
  config.calendar.ids.map(calendarId => {
    schedule.scheduleJob('*/3 * * * *', () => {
      console.log(moment().toString() + 'noticeUpsertedEvents')
      noticeUpsertedEvents(oAuth2Client, calendarId)
    })
    schedule.scheduleJob('*/1 * * * *', () => {
      console.log(moment().toString() + 'noticeSoonEvents')
      noticeSoonEvents(oAuth2Client, calendarId)
    })

    schedule.scheduleJob('23 9 * * *', () => {
      console.log(moment().toString() + 'noticeDailyEvents')
      noticeDailyEvents(oAuth2Client, calendarId)
    })

    schedule.scheduleJob('30 9 * * 1', () => {
      console.log(moment().toString() + 'noticeWeeklyEvents')
      noticeWeeklyEvents(oAuth2Client, calendarId)
    })

    schedule.scheduleJob('*/1 * * * *', () => {
      console.log(moment().toString() + 'noticeSoonDayEvents')
      noticeSoonDayEvents(oAuth2Client, calendarId)
    })
  })
}

exports.run()

function noticeWeeklyEvents(auth, calendarId) {
  const calendar = google.calendar({version: 'v3', auth})
  const timeMin = moment().toDate()
  const timeMax = moment().add(7, 'days').toDate()
  calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, response) => {
    if (err) return console.log('noticeWeeklyEvents The API returned an error: ' + err)
    const events = response.data.items
    if (events.length) {
      const info = events.map((event) => {
        const start = event.start.dateTime || event.start.date
        const year = moment(start).format('YYYY')
        const month = moment(start).format('MM')
        const day = moment(start).format('DD')
        const hour = moment(start).format('HH')
        const minute = moment(start).format('mm')
        const dayNumber = moment(start).format('e')
        return `\`${year}년 ${month}월 ${day}일 ${getDayOfWeekString(dayNumber)} ${hour}시 ${minute}분\` [${event.summary}](${event.htmlLink})`
      })
      const message = `*${response.data.summary}*\n_다음주 월요일까지 캠프 캘린더에 등록한 일정입니다._\n\n${_.join(info, '\n')}`
      telegramBot.sendMessage(config.bot.telegramChatId, message, {parse_mode: 'Markdown'})
    }
  })
}

function noticeUpsertedEvents(auth, calendarId) {
  const calendar = google.calendar({version: 'v3', auth})
  calendar.events.list({
    calendarId: calendarId,
    timeMin: moment().toDate(),
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, response) => {
    if (err) return console.log('noticeUpsertedEvents The API returned an error: ' + err)
    const events = response.data.items
    if (events.length) {
      const info = events.filter(event => {
        const start = event.start.dateTime || event.start.date
        return moment().set({second: 0, millisecond: 0}).diff(event.updated, 'minutes') < 4
      }).map((event) => {
        const start = event.start.dateTime || event.start.date
        const year = moment(start).format('YYYY')
        const month = moment(start).format('MM')
        const day = moment(start).format('DD')
        const hour = moment(start).format('HH')
        const minute = moment(start).format('mm')
        const dayNumber = moment(start).format('e')
        return `\`${year}년 ${month}월 ${day}일 ${getDayOfWeekString(dayNumber)} ${hour}시 ${minute}분\` [${event.summary}](${event.htmlLink})`
      })
      const message = `*${response.data.summary}*\n_최근 신규 등록 또는 수정한 일정입니다._\n\n${_.join(info, '\n')}`
      if (!_.isEmpty(info)) {
        telegramBot.sendMessage(config.bot.telegramChatId, message, {parse_mode: 'Markdown'})
      }
    }
  })
}

function noticeDailyEvents(auth, calendarId) {
  const calendar = google.calendar({version: 'v3', auth})
  const timeMin = moment().toDate()
  const timeMax = moment().add(1, 'days').toDate()
  calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, response) => {
    if (err) return console.log('noticeDailyEvents The API returned an error: ' + err)
    const events = response.data.items
    if (events.length) {
      const info = events.map((event) => {
        const start = event.start.dateTime || event.start.date
        const year = moment(start).format('YYYY')
        const month = moment(start).format('MM')
        const day = moment(start).format('DD')
        const hour = moment(start).format('HH')
        const minute = moment(start).format('mm')
        const dayNumber = moment(start).format('e')
        return `\`${year}년 ${month}월 ${day}일 ${getDayOfWeekString(dayNumber)} ${hour}시 ${minute}분\` [${event.summary}](${event.htmlLink})`
      })
      const message = `*${response.data.summary}*\n_오늘 일정입니다._\n\n${_.join(info, '\n')}`
      telegramBot.sendMessage(config.bot.telegramChatId, message, {parse_mode: 'Markdown'})
    }
  })
}

function noticeSoonEvents(auth, calendarId) {
  const calendar = google.calendar({version: 'v3', auth})
  const timeMin = moment().toDate()
  const timeMax = moment().add(10, 'minutes').set({second: 59, millisecond: 0}).toDate()
  calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, response) => {
    if (err) return console.log('noticeWeeklyEvents The API returned an error: ' + err)
    const events = response.data.items
    if (events.length) {
      const info = events.filter(event => {
        const start = event.start.dateTime || event.start.date
        return moment().set({second: 0, millisecond: 0}).to(start) === 'in 10 minutes'
      }).map((event) => {
        const start = event.start.dateTime || event.start.date
        const year = moment(start).format('YYYY')
        const month = moment(start).format('MM')
        const day = moment(start).format('DD')
        const hour = moment(start).format('HH')
        const minute = moment(start).format('mm')
        const dayNumber = moment(start).format('e')
        return `\`${year}년 ${month}월 ${day}일 ${getDayOfWeekString(dayNumber)} ${hour}시 ${minute}분\` [${event.summary}](${event.htmlLink})`
      })
      const message = `*${response.data.summary}*\n_다음 일정이 약 10분 후 시작합니다._\n\n${_.join(info, '\n')}`
      if (!_.isEmpty(info)) {
        telegramBot.sendMessage(config.bot.telegramChatId, message, {parse_mode: 'Markdown'})
      }
    }
  })
}

function noticeSoonDayEvents(auth, calendarId) {
  const calendar = google.calendar({version: 'v3', auth})
  const timeMin = moment().toDate()
  const timeMax = moment().add(1, 'days').set({second: 59, millisecond: 0}).toDate()
  calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, response) => {
    if (err) return console.log('noticeWeeklyEvents The API returned an error: ' + err)
    const events = response.data.items
    if (events.length) {
      const info = events.filter(event => {
        const start = event.start.dateTime || event.start.date
        return moment(start).diff(moment().set({second: 0, millisecond: 0}), 'hours') === 24
      }).map((event) => {
        const start = event.start.dateTime || event.start.date
        const year = moment(start).format('YYYY')
        const month = moment(start).format('MM')
        const day = moment(start).format('DD')
        const hour = moment(start).format('HH')
        const minute = moment(start).format('mm')
        const dayNumber = moment(start).format('e')
        return `\`${year}년 ${month}월 ${day}일 ${getDayOfWeekString(dayNumber)} ${hour}시 ${minute}분\` [${event.summary}](${event.htmlLink})`
      })
      const message = `*${response.data.summary}*\n_다음 일정이 약 24시간 후 시작합니다._\n\n${_.join(info, '\n')}`
      if (!_.isEmpty(info)) {
        telegramBot.sendMessage(config.bot.telegramChatId, message, {parse_mode: 'Markdown'})
      }
    }
  })
}
