const fs = require('fs')
const {promisify} = require('util')
const readline = require('readline')
const {google} = require('googleapis')
const schedule = require('node-schedule')

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

exports.run = async () => {
  const content = await readFileAsync(CLIENT_SECRET_PATH)
  const {client_secret, client_id, redirect_uris} = JSON.parse(content).web

  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0])

  let token
  try {
    token = await readFileAsync(TOKEN_PATH)
    oAuth2Client.setCredentials(JSON.parse(token))

  } catch (err) {
    token = getAccessToken(oAuth2Client)
  }
  listEvents(oAuth2Client)

  // schedule.scheduleJob('*/1 * * * *', () => {
  //   console.log((new Date()).toISOString())
  // })
}

exports.run()

function listEvents(auth) {
  const calendar = google.calendar({version: 'v3', auth})
  calendar.events.list({
    calendarId: 'primary',
    timeMin: (new Date()).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, {data}) => {
    if (err) return console.log('The API returned an error: ' + err)
    const events = data.items
    if (events.length) {
      console.log('Upcoming 10 events:')
      events.map((event, i) => {
        const start = event.start.dateTime || event.start.date
        console.log(`${start} - ${event.summary}`)
      })
    } else {
      console.log('No upcoming events found.')
    }
  })
}
