#!/usr/bin/env node

const fs = require('fs');
const cheerio = require('cheerio');
const { version: uHTTPVersion } = require('../package.json');
require('dotenv').config();

main();

function main() {
    createFileStructure();
    const originalHTML = getIndexHTML();
    const elements = getScriptsAndLinks(originalHTML);
    const newHTML = prepareNewIndexHTML(originalHTML);
    saveIndexHTML(newHTML);
    preparePersonalasiedStartingScript(elements);
}

function createFileStructure() {
    console.log('Creating file structure');

    const buildFolderPath = process.env.buildFolderPath || './build';

    fs.mkdirSync(`${buildFolderPath}/uHTTP`, { recursive: true });

    fs.copyFileSync(
        './node_modules/@hoprnet/uhttp-lib/service-worker/service-worker.js',
        `${buildFolderPath}/service-worker.js`,
    );
    console.log('/service-worker.js file copied');

    fs.copyFileSync(
        './node_modules/@hoprnet/uhttp-lib/service-worker/start-uHTTP.js',
        `${buildFolderPath}/uHTTP/start-uHTTP.js`,
    );
    console.log('/start-uHTTP.js file copied');

    fs.copyFileSync(
        './node_modules/@hoprnet/uhttp-lib/dist/uhttp-lib.min.mjs',
        `${buildFolderPath}/uHTTP/uhttp-lib.min.mjs`,
    );
    console.log('/uHTTP/uhttp-lib.min.mjs file copied');
}

function getIndexHTML() {
    console.log('Loading original index.html');
    return fs.readFileSync('./build/index.html').toString();
}

function saveIndexHTML(html) {
    console.log('Saving new uHTTP injected index.html');
    return fs.writeFileSync('./build/index.html', html);
}

function getScriptsAndLinks(originalHTML) {
    console.log('Grabbing all script and link tags');
    const $ = cheerio.load(originalHTML);

    function getElements(selector) {
        return $(selector)
            .map((_, el) => ({
                tag: el.name,
                attributes: el.attribs,
            }))
            .get();
    }

    return [...getElements('head > script'), ...getElements('head > link')];
}

function prepareNewIndexHTML(originalHTML) {
    console.log('Removing all script and link tags');
    const $ = cheerio.load(originalHTML);

    $('head > script').remove();
    $('head > link').remove();
    console.log('Adding uHTTP service worker script');
    $('head').append('<script type="module" crossorigin src="/uHTTP/start-uHTTP.js"></script>');
    const output = $.html();

    return output;
}

function preparePersonalasiedStartingScript(elements) {
    let startuHTTPFile = fs.readFileSync('./build/uHTTP/start-uHTTP.js').toString();
    startuHTTPFile = startuHTTPFile.replace('REPLACE_uClientId', process.env.uClientId);
    startuHTTPFile = startuHTTPFile.replace('REPLACE_uForceZeroHop', process.env.uForceZeroHop);
    startuHTTPFile = startuHTTPFile.replace(
        'REPLACE_discoveryPlatformEndpoint',
        process.env.discoveryPlatformEndpoint,
    );
    startuHTTPFile = startuHTTPFile.replace('REPLACE_uHTTPVersion', uHTTPVersion);
    startuHTTPFile = startuHTTPFile + createAppendFunction(elements);
    fs.writeFileSync('./build/uHTTP/start-uHTTP.js', startuHTTPFile);
}

function createAppendFunction(elements) {
    let output = ['function appendPage() {'];

    elements.map((element, index) => {
        output.push(`    const s${index} = document.createElement("${element.tag}");`);
        const attributes = element.attributes;
        const attributeNames = Object.keys(attributes);
        for (let i = 0; i < attributeNames.length; i++) {
            const key = attributeNames[i];
            const value = attributes[key];
            output.push(`    s${index}.${key} = "${value}";`);
        }
        output.push(`    document.querySelector('head').append(s${index});`);
    });

    output.push('};');
    return output.join('\n');
}
