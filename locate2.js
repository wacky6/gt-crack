const {
    writeIntermediateFile,
    createPngFromImageData,
} = require('./util')

const WRITE_INTERMEDIATES = Boolean(process.env['DEBUG'])
const getSeq = () => process.env['__SEQ'] || '0'

// compute absolute delta for RGB channel
function computeRGBDelta(before, after) {
    const delta = new Uint8ClampedArray(before.data.length)
    for (let i = 0; i !== before.data.length / 4; ++i) {
        delta[4*i] = Math.abs(before.data[4*i] - after.data[4*i])
        delta[4*i+1] = Math.abs(before.data[4*i+1] - after.data[4*i+1])
        delta[4*i+2] = Math.abs(before.data[4*i+2] - after.data[4*i+2])
        delta[4*i+3] = 255
    }
    if (WRITE_INTERMEDIATES) {
        writeIntermediateFile(`delta-rgb-${getSeq()}.png`, createPngFromImageData({
            width: before.width,
            height: before.height,
            data: delta
        }))
    }
    return {
        data: delta,
        colorType: 6,
        depth: 4,
        width: before.width,
        height: before.height
    }
}

// assume input is one dimension RGBA array
// return ImageData-like object
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

// assume input is binarized RGBA 8-bit ImageData-like
// aggregate to X axis
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
    if (WRITE_INTERMEDIATES) {
        writeIntermediateFile(`delta-flatten-${getSeq()}.png`, createPngFromImageData(inflate(ret)))
    }
    return ret
}

// assume input is one dimension RGBA array
function monotonizeRGBA(arr) {
    const width = arr.length / 4
    let ret = new Uint8ClampedArray(arr.length)
    for (let i = 0; i !== width; ++i) {
        ret[i*4] = ret[i*4+1] =ret[i*4+2] = Math.max(arr[i*4], arr[i*4+1], arr[i*4+2])
        ret[i*4+3] = 255    // alpha
    }
    if (WRITE_INTERMEDIATES) {
        writeIntermediateFile(`delta-monotone-${getSeq()}.png`, createPngFromImageData(inflate(ret)))
    }
    return ret
}

// assume input is one dimension RGBA array
function binarizeRGBA(arr, threshold = 0x30) {
    const width = arr.length / 4
    let ret = new Uint8ClampedArray(arr.length)
    for (let i = 0; i !== width; ++i) {
        ret[i*4] = ret[i*4+1] =ret[i*4+2] = Math.max(arr[i*4], arr[i*4+1], arr[i*4+2]) > threshold ? 255 : 0
        ret[i*4+3] = 255    // alpha
    }
    if (WRITE_INTERMEDIATES) {
        writeIntermediateFile(`delta-binary-${getSeq()}.png`, createPngFromImageData(inflate(ret)))
    }
    return ret
}

// transform binarized RGBA array to bitmask array (0 / 255)
function toSingleChannel(arr) {
    const width = arr.length / 4
    let ret = new Uint8ClampedArray(width)
    for (let i = 0; i !== width; ++i) {
        ret[i] = arr[4*i]
    }
    return ret
}

// find XOffset from one dimension binarized RGBA array
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
