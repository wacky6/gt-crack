const fs = require('fs')
const mkdirp = require('mkdirp').sync
const { join } = require('path')

const PNG = require('pngjs').PNG

const DATA_DIR = 'data'

module.exports = {
    writeIntermediateFile(name, buf) {
        mkdirp(DATA_DIR)
        return fs.writeFileSync(join(DATA_DIR, name), buf)
    },
    readIntermediateFile(name, buf) {
        return fs.readFileSync(join(DATA_DIR, name), buf)
    },
    getImageDataFromPng(pngBuf) {
        const png = PNG.sync.read(pngBuf)
        return {
            colorType: 6,
            bitDepth: 8,
            depth: 4,
            order: 'rgba',
            width: png.width,
            height: png.height,
            data: Uint8ClampedArray.from(png.data)
        }
    },
    createPngFromImageData(imageData) {
        return PNG.sync.write({
            colorType: 6,
            bitDepth: 8,
            width: imageData.width,
            height: imageData.height,
            data: imageData.data
        })
    },
    DATA_DIR
}
