/**
 * Stockfish Lite Worker Wrapper
 * Loads the WebAssembly engine dynamically from a CDN to avoid storing large binaries in the codebase.
 */

// Import the Stockfish engine script from unpkg
importScripts('https://unpkg.com/stockfish.js@10.0.2/stockfish.js');


importScripts('https://unpkg.com/stockfish.js@10.0.2/stockfish.js');
var engine = typeof STOCKFISH === "function" ? STOCKFISH() : new Worker("stockfish.js");

self.onmessage = function (event) {
    engine.postMessage(event.data);
};

engine.onmessage = function (event) {
    self.postMessage(event.data ?? event); // Handle string or object
};
