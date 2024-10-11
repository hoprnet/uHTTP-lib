const fs = require('fs');
const cheerio = require('cheerio');
const uHTTP = require('../node_modules/@hoprnet/uhttp-lib/package.json');
require('dotenv').config()

main();

function main() {
    const originalHTML = getIndexHTML();
    const elements = getScriptsAndLinks(originalHTML);
    const newHTML = prepareNewIndexHTML(originalHTML);
    saveIndexHTML(newHTML);
    preparePersonalasiedStartingScript(elements);
};


function getIndexHTML() {
    console.log('Loading original index.html')
    return fs.readFileSync('./build/index.html').toString();
};

function saveIndexHTML(html) {
    console.log('Saving new uHTTP injected index.html')
    return fs.writeFileSync('./build/index.html', html);
};

function getScriptsAndLinks(originalHTML) {
    console.log('Grabbing all script and link tags')
    const $ = cheerio.load(originalHTML);

    let elements = [];


    const scripts = $('head > script');

    for (let i = 0; i < scripts.length; i++) {
        const el = scripts[i];
        const attributes = el.attribs;
        elements.push({
            tag: 'script',
            attributes,
        });
    }


    const links = $('head > link');

    for (let i = 0; i < links.length; i++) {
        const el = links[i];
        const attributes = el.attribs;
        elements.push({
            tag: 'link',
            attributes,
        });
    }

    return elements;
};

function prepareNewIndexHTML(originalHTML) {
    console.log('Removing all script and link tags')
    const $ = cheerio.load(originalHTML);

    $('head > script').remove();
    $('head > link').remove();
    $('').add();
    console.log('Adding uHTTP service worker script')
    $('head').append('<script type="module" crossorigin src="/uHTTP/start-uHTTP.js"></script>');
    const output = $.html();

    return output;
};

function preparePersonalasiedStartingScript(elements) {
    let startuHTTPFile = fs.readFileSync('./build/uHTTP/start-uHTTP.js').toString();
    startuHTTPFile = startuHTTPFile.replace('REPLACE_uClientId', process.env.uClientId);
    startuHTTPFile = startuHTTPFile.replace('REPLACE_uForceZeroHop', process.env.uForceZeroHop);
    startuHTTPFile = startuHTTPFile.replace('REPLACE_discoveryPlatformEndpoint', process.env.discoveryPlatformEndpoint);
    startuHTTPFile = startuHTTPFile.replace('REPLACE_uHTTPVersion', uHTTP.version);
    startuHTTPFile = startuHTTPFile + createAppendFunction(elements);
    fs.writeFileSync('./build/uHTTP/start-uHTTP.js', startuHTTPFile);
};


function createAppendFunction(elements) {
    let output = `\nasync function appendPage() {\n`

    elements.map((element, index) =>{
        output = output + `    const s${index} = document.createElement("${element.tag}");\n`
        const attributes = element.attributes;
        const attributeNames = Object.keys(attributes);
        for(let i = 0; i < attributeNames.length; i++) {
            const key = attributeNames[i];
            const value = attributes[key];
                    output = output + `    s${index}.${key} = "${value}";\n`
        }
        output = output + `    document.querySelector('head').append(s${index});\n`
    })

    output = output + `}\n`
    return output;
}
