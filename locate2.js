const fs = require('fs')
const PNG = require('pngjs').PNG

const files = fs.readdirSync('data/')
const sources = files.filter(f => f.startsWith('source-'))
const getFirstDeltaName = source => source.replace('source-', 'first-delta-')
const getDeltaName = source => source.replace('source-', 'delta-')

function getPngPixels(pngBuffer) {
    const png = PNG.sync.read(pngBuffer)
    return {
        depth: 4,
        order: 'rgba',
        width: png.width,
        height: png.height,
        data: Uint8ClampedArray.from(png.data)
    }
}

function computeDelta(before, after) {
    const delta = new Uint8ClampedArray(before.data.length)
    for (let i = 0; i !== before.data.length / 4; ++i) {
        const brightnessBefore = 0.2126 * before.data[4*i] + 0.7152 * before.data[4*i+1] + 0.0722 * before.data[4*i+2]
        const brightnessAfter = 0.2126 * after.data[4*i] + 0.7152 * after.data[4*i+1] + 0.0722 * after.data[4*i+2]

        delta[4*i] = Math.abs(brightnessBefore - brightnessAfter)
        delta[4*i+1] = Math.abs(brightnessBefore - brightnessAfter)
        delta[4*i+2] = Math.abs(brightnessBefore - brightnessAfter)

        delta[4*i+3] = 255
    }
    return {
        data: delta,
        colorType: 6,
        depth: 4,
        width: before.width,
        height: before.height
    }
}

function getEdgePixels(x, y) {
    return [
        [x+1, y],
        [x-1, y],
        [x, y+1],
        [x, y-1]
    ]
}

function getSurroundings(x, y) {
    return [
        [x, y-1],
        [x+1, y-1],
        [x+1, y],
        [x+1, y+1],
        [x, y+1],
        [x-1, y+1],
        [x-1, y],
        [x-1, y-1],
    ]
}

function erode(pixels, threshold = 0x80) {
    let queue = []
    let ret = new Uint8ClampedArray(pixels.data.length)

    ret.set(pixels.data, 0)

    function getXY(x, y) {
        if (y < 0 || x < 0 || y >= pixels.height || x >= pixels.width) return 0
        const pos = y * pixels.width + x
        return ret[4 * pos]
    }

    for (let y = 0; y !== pixels.height; ++y) {
        for (let x = 0; x !== pixels.width; ++x) {

            queue.push([x, y])

            while (queue.length) {
                const [x, y] = queue.shift()

                if (getXY(x, y) >= threshold) continue

                let vals = []
                for (let [x2, y2] of getEdgePixels(x,y)) {
                    vals.push(getXY(x2, y2))
                }

                const majority = vals.filter(v => v >= threshold).length / vals.length >= 0.3 ? 255 : 0

                // queue surroundings if assignment flips
                if (majority !== getXY(x, y)) {
                    for (let [x2, y2] of getSurroundings(x,y)) {
                        if (getXY(x2, y2) < threshold) {
                            queue.push([x2, y2])
                        }
                    }
                }

                const pixelPos = y * pixels.width + x
                ret[pixelPos * 4] = majority
                ret[pixelPos * 4 + 1] = majority
                ret[pixelPos * 4 + 2] = majority
            }
        }
    }

    return {
        data: ret,
        colorType: 6,
        depth: 4,
        width: pixels.width,
        height: pixels.height
    }
}

function binarize(delta, THRESHOLD = 0x40) {
    function getXY(x, y) {
        const pos = y * delta.width + x
        return delta.data[4 * pos]
    }

    function binarizePixel(val) {
        return val > THRESHOLD ? 255 : 0
    }

    const ret = new Uint8ClampedArray(delta.data.length)

    // pool surrounding pixels
    for (let y = 0; y !== delta.height; ++y) {
        for (let x = 0; x !== delta.width; ++x) {
            const vals = []
            const SURROUNDING = 0
            // get surrounding pixels
            for (let i = -SURROUNDING; i <= SURROUNDING; ++i) {
                for (let j = -SURROUNDING; j <= SURROUNDING; ++j) {
                    vals.push(getXY(x+i, y+j))
                }
            }
            const polledResult = Math.max(...vals)
            const pixelPos = y * delta.width + x

            ret[pixelPos * 4] = binarizePixel(polledResult)
            ret[pixelPos * 4 + 1] = binarizePixel(polledResult)
            ret[pixelPos * 4 + 2] = binarizePixel(polledResult)
            ret[pixelPos * 4 + 3] = 255    // alpha channel
        }
    }

    return {
        data: ret,
        colorType: 6,
        depth: 4,
        width: delta.width,
        height: delta.height
    }
}

function computeRGBDelta(before, after) {
    const delta = new Uint8ClampedArray(before.data.length)
    for (let i = 0; i !== before.data.length / 4; ++i) {
        delta[4*i] = Math.abs(before.data[4*i] - after.data[4*i])
        delta[4*i+1] = Math.abs(before.data[4*i+1] - after.data[4*i+1])
        delta[4*i+2] = Math.abs(before.data[4*i+2] - after.data[4*i+2])
        delta[4*i+3] = 255
    }
    return {
        data: delta,
        colorType: 6,
        depth: 4,
        width: before.width,
        height: before.height
    }
}

// assume input is binarized RGBA 8-bit ImageData-like
function flattenToX(pixels) {
    let ret = new Uint8ClampedArray(pixels.width * 4)
    for (let x = 0; x !== pixels.width; ++x) {
        for (let ch = 0; ch !== 3; ++ch) {
            let max = 0
            for (let y = 0; y !== pixels.height; ++y) {
                const pixelPos = y * pixels.width + x
                max = Math.max(max, pixels.data[pixelPos * 4 + ch])
            }
            ret[4 * x + ch] = max
        }
        ret[4 * x + 3] = 255
    }
    return ret
}

// assume input is one dimension RGBA array
function inflate(flattened) {
    const width = flattened.length / 4
    const height = 32
    const data = new Uint8ClampedArray(width * height)
    for (let i = 0; i !== flattened.length; ++i) {
        for (let y = 0; y !== height; ++y) {
            data[y * flattened.length + i] = flattened[i]
        }
    }
    return {
        colorType: 6,
        bitDepth: 8,
        width,
        height,
        data
    }
}

// assume input is one dimension RGBA array
function monotonizeRGBA(arr) {
    const width = arr.length / 4
    let ret = new Uint8ClampedArray(arr.length)
    for (let i = 0; i !== width; ++i) {
        ret[i*4] = ret[i*4+1] =ret[i*4+2] = Math.max(arr[i*4], arr[i*4+1], arr[i*4+2])
        ret[i*4+3] = 255    // alpha
    }
    return ret
}

function binarizeRGBA(arr, threshold = 0x30) {
    const width = arr.length / 4
    let ret = new Uint8ClampedArray(arr.length)
    for (let i = 0; i !== width; ++i) {
        ret[i*4] = ret[i*4+1] =ret[i*4+2] = Math.max(arr[i*4], arr[i*4+1], arr[i*4+2]) > threshold ? 255 : 0
        ret[i*4+3] = 255    // alpha
    }
    return ret
}

function toSingleChannel(arr) {
    const width = arr.length / 4
    let ret = new Uint8ClampedArray(width)
    for (let i = 0; i !== width; ++i) {
        ret[i] = arr[4*i]
    }
    return ret
}

function locateXOffset(rgba) {
    const mask = toSingleChannel(rgba)

    // locate flip location
    let flips = []
    for (let x = 1; x !== mask.length; ++x) {
        if (mask[x] !== mask[x-1]) {
            flips.push(x)
        }
    }

    // check flip pattern
    if (flips.length === 4) {
        // normal situation
        const x1 = (flips[0] + flips[1]) / 2
        const x2 = (flips[2] + flips[3]) / 2
        return Math.round(x2 - x1)
    } else if (flips.length === 2) {
        // merged into one
        const x = flips[1] - flips[0]
        const rightRatio = 0.47    // based on experience
        const w1 = (x * (1-rightRatio))
        const w2 = x * rightRatio
        const x1 = w1 / 2
        const x2 = w1 + w2 / 2
        return Math.round(x2 - x1)
    } else {
        return null
    }
}

module.exports = function(before, after) {
    const xDelta = flattenToX(computeRGBDelta(before, after))
    const binaryXDelta = binarizeRGBA(monotonizeRGBA(xDelta))
    return locateXOffset(binaryXDelta)
}

// for (let source of sources) {
//     const pixelBefore = getPngPixels(fs.readFileSync(`data/${source}`))
//     const pixelAfter = getPngPixels(fs.readFileSync(`data/${getFirstDeltaName(source)}`))
//     // const delta = computeDelta(pixelBefore, pixelAfter)
//     // const binaryDelta = binarize(delta, 0x30)
//     // const erodedDelta = erode(binaryDelta)

//     const deltaRGB = computeRGBDelta(pixelBefore, pixelAfter)
//     const flattened = binarizeRGBA(monotonizeRGBA(flattenToX(deltaRGB)))
//     fs.writeFileSync(
//         `data/${getDeltaName(source)}`,
//         PNG.sync.write(inflate(flattened))
//     )

//     const offset = locateXOffset(flattened)


//     fs.writeFileSync(
//         `data/${getDeltaName(source)}`,
//         PNG.sync.write({
//             colorType: 6,
//             bitDepth: 8,
//             width: erodedDelta.width,
//             height: erodedDelta.height,
//             data: erodedDelta.data
//         })
//     )
// }