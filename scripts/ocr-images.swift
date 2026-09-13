import AppKit
import Foundation
import Vision

private func recognize(_ path: String) throws -> [String] {
  guard let image = NSImage(contentsOfFile: path) else {
    throw NSError(domain: "WordEchoOCR", code: 1, userInfo: [
      NSLocalizedDescriptionKey: "Cannot open image: \(path)",
    ])
  }

  var proposedRect = NSRect(origin: .zero, size: image.size)
  guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
    throw NSError(domain: "WordEchoOCR", code: 2, userInfo: [
      NSLocalizedDescriptionKey: "Cannot decode image: \(path)",
    ])
  }

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["en-US", "zh-Hans"]
  request.usesLanguageCorrection = true
  request.minimumTextHeight = 0.006

  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  try handler.perform([request])

  return (request.results ?? [])
    .sorted {
      let firstY = $0.boundingBox.maxY
      let secondY = $1.boundingBox.maxY
      if abs(firstY - secondY) > 0.012 { return firstY > secondY }
      return $0.boundingBox.minX < $1.boundingBox.minX
    }
    .compactMap { $0.topCandidates(1).first?.string }
}

let paths = Array(CommandLine.arguments.dropFirst())
guard !paths.isEmpty else {
  FileHandle.standardError.write(Data("Usage: ocr-images <image>...\n".utf8))
  exit(2)
}

for path in paths {
  print("===== \(path) =====")
  do {
    for line in try recognize(path) {
      print(line)
    }
  } catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
  }
}
