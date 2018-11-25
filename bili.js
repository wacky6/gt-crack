const puppeteer = require('puppeteer')
const Random = require('random-js')()
const {
    getImageDataFromPng,
    writeIntermediateFile,
} = require('./util')

function randomXYfromCenter(xLeft, yTop, width, height) {
    return [
        Random.integer(xLeft + 0.3 * width, xLeft + 0.7 * width),
        Random.integer(yTop + 0.3 * height, yTop + 0.7 * height)
    ]
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const WRITE_INTERMEDIATES = Boolean(process.env['DEBUG'])

async function tryCrackBilibili(page, seq = 0) {
    const fileSuffix = String(seq).padStart(3, '0')

    await page.waitForSelector('.gt_slider_knob')
    await sleep(1000)

    const knob = await page.$('.gt_slider_knob')
    const knobRect = await knob.boundingBox()

    const [ startX, startY ] = randomXYfromCenter(knobRect.x, knobRect.y, knobRect.width, knobRect.height)
    await page.mouse.move(startX, startY)

    await sleep(1000)

    const captchaWrap = await page.$('.gt_widget')
    const captchaRect = await captchaWrap.boundingBox()

    const imageBefore = await page.screenshot({ type: 'png', encoding: 'binary', clip: captchaRect })
    const pixelsBefore = getImageDataFromPng(imageBefore)

    WRITE_INTERMEDIATES && writeIntermediateFile(`source-${fileSuffix}.png`, imageBefore)

    await page.mouse.down()
    await sleep(1000)

    const imageAfter = await page.screenshot({ type: 'png', encoding: 'binary', clip: captchaRect })
    const pixelsAfter = getImageDataFromPng(imageAfter)

    WRITE_INTERMEDIATES && writeIntermediateFile(`first-delta-${fileSuffix}.png`, imageAfter)

    // get xOffset, the amount of horizontal pixels to move
    const xOffset = require('./locate2')(pixelsBefore, pixelsAfter)
    if (xOffset === null) return false

    // simulate mouse track
    const mouseTrack = require('./track-timed-ease')(xOffset)
    for (let [xDelta, delay] of mouseTrack) {
        await page.mouse.move(startX + xDelta, startY)
        await sleep(delay)
    }

    // release mouse
    await sleep(Random.integer(300, 750))
    await page.mouse.up()

    // wait for success prompt
    return page.waitForSelector('.gt_info_tip.gt_success', { timeout: 10000 }).then(_ => true, _ => false)
}

async function testBilibili() {
    const browser = await puppeteer.launch({ headless: true })

    for (let i = 0; i !== 50; ++i) {
        if (WRITE_INTERMEDIATES) {
            process.env['__SEQ'] = i
        }

        const page = await browser.newPage()
        await page.setViewport({
            width: 1270,
            height: 660
        })
        await page.goto('https://passport.bilibili.com/login')

        const result = await tryCrackBilibili(page, i)
        console.log(result ? 1 : 0)

        await page.close()

        await sleep(Random.integer(5, 20) * 1000)
    }

    await browser.close()
}

module.exports = tryCrackBilibili
module.exports.test = testBilibili
