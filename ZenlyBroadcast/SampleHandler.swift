//
//  SampleHandler.swift
//  ZenlyBroadcast
//
//  Created by Andrew Hu on 6/26/26.
//

import ReplayKit
import CoreImage
import UIKit

class SampleHandler: RPBroadcastSampleHandler {

    private static let appGroupIdentifier = "group.com.andrewh.zenly"
    private static let frameFileName = "latest_frame.jpg"
    private static let jpegQuality: CGFloat = 0.5
    private static let minWriteInterval: TimeInterval = 1.0

    // Created once — CIContext is expensive to allocate.
    private let ciContext = CIContext()
    private var lastWriteTime: Date = .distantPast

    private lazy var frameURL: URL? = {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier)?
            .appendingPathComponent(Self.frameFileName)
    }()

    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        lastWriteTime = .distantPast
    }

    override func broadcastPaused() {
        // User has requested to pause the broadcast. Samples will stop being delivered.
    }

    override func broadcastResumed() {
        // User has requested to resume the broadcast. Samples delivery will resume.
    }

    override func broadcastFinished() {
        // Best-effort cleanup so the main app doesn't poll a stale frame.
        if let frameURL {
            try? FileManager.default.removeItem(at: frameURL)
        }
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }

        // Throttle to at most one write per second.
        let now = Date()
        guard now.timeIntervalSince(lastWriteTime) >= Self.minWriteInterval else { return }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return }

        let uiImage = UIImage(cgImage: cgImage)
        guard let jpegData = uiImage.jpegData(compressionQuality: Self.jpegQuality),
              let frameURL else { return }

        do {
            try jpegData.write(to: frameURL, options: .atomic)
            lastWriteTime = now
        } catch {
            // Non-fatal: drop this frame and try again on the next buffer.
        }
    }
}
