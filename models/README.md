# Bundled models

| File | Purpose | Source | License |
| --- | --- | --- | --- |
| ppocr-v4-det.onnx | Text line detection (DBNet, PP-OCRv4 mobile) | PaddleOCR, ONNX export as shipped in the `rapidocr_onnxruntime` 1.4.4 Python package | Apache-2.0 |

The detector runs on the server with `onnxruntime-web` (WebAssembly, no native
binaries). It only locates text lines; reading, classification and translation
are done by Gemini on a numbered overlay of these boxes, so Gemini never has to
output coordinates.
