const PNG = require('pngjs').PNG
const fs = require('fs')

const mode = (array) => {
    const map = new Map();
    let maxFreq = 0;
    let mode;

    for(const item of array) {
        let freq = map.has(item) ? map.get(item) : 0;
        freq++;

        if(freq > maxFreq) {
            maxFreq = freq;
            mode = item;
        }

        map.set(item, freq);
    }

    return mode;
};

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
            const SURROUNDING = 3
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

function locate(binaryMap, GAP_THRESHOLD = 10) {
    const {
        data,
        width,
        height
    } = binaryMap

    function getXY(x, y) {
        const pos = y * width + x
        return data[pos * 4]
    }

    const offsets = []

    // scan from right
    for (let y = 0; y !== height; ++y) {
        let observations = []
        let rightPos = -1
        let leftPos = -1
        let rightDetected = false
        for (let x = width - 1; x >= 0; --x) {
            const val = getXY(x, y)

            observations.push(val)
            observations.length > GAP_THRESHOLD && observations.shift()

            // check for right rect's right edge
            if (rightPos === -1 && val === 0xff) {
                rightPos = x
            }

            // check for left rect's left edge
            if (   rightPos >= 0
                && observations.length === GAP_THRESHOLD
                && observations.filter(ob => ob === 0).length === GAP_THRESHOLD
            ) {
                rightDetected = true
            }

            if (rightDetected && leftPos === -1 && val === 0xff) {
                leftPos = x
                offsets.push(rightPos - leftPos)
                break
            }
        }
    }

    // get mode of X
    return mode(offsets)
}

module.exports = function deltaLocate(sourcePixels, knobPixels) {
    const delta = computeDelta(sourcePixels, knobPixels)
    const binaryDelta = binarize(delta)
    const xPos = locate(binaryDelta)
    return xPos
}