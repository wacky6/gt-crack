const Random = require('random-js')()
const Easing = require('d3-ease')

module.exports = function timedEase(xOffset) {
    const numSlices = Math.floor(xOffset / 3) + Random.integer(-3, 5)
    const easingParam = Math.random() / 2 + 0.9
    let ret = []
    for (let i = 0; i !== numSlices; ++i) {
        const xDelta = Math.floor(Easing.easeBackOut((i+1) / numSlices, easingParam) * xOffset)
        ret.push([xDelta, 33 + Random.integer(-12, 24)])
    }
    return ret
}