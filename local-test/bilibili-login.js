const crackBilibili = require('../bili')
const puppeteer = require('puppeteer')

async function bilibiliLogin(username, password) {
    const visible = Boolean(process.env['NO_HEADLESS'])
    const browser = await puppeteer.launch({ headless: !visible })

    const page = await browser.newPage()
    await page.setViewport({
        width: 1270,
        height: 660
    })
    await page.goto('https://passport.bilibili.com/login')

    await page.waitForSelector('.gt_slider_knob')

    const userInput = await page.$('#login-username')
    const passwordInput = await page.$('#login-passwd')

    await userInput.type(username)
    await passwordInput.type(password)

    const result = await crackBilibili(page, 'bili')

    return new Promise(resolve => {
        setTimeout(resolve, 5000)
        await page.close()
        await browser.close()
        return result
    })
}

bilibiliLogin(process.env['USER'], process.env['PASSWORD']).then(result => console.log(result))