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
    private static let userPhoneKey = "userPhone"   // written by the main app's SessionStore
    private static let jpegQuality: CGFloat = 0.5

    // Keep this in sync with API_BASE_URL in Zenly/ContentView.swift.
    private static let judgeURL = URL(string: "http://192.168.7.29:3001/judge")!

    // Judging runs a vision model server-side, so throttle uploads (the old main-app
    // loop polled every 5s). The extension keeps running while the user is in other
    // apps, which is exactly when we need to catch them off task.
    private static let uploadInterval: TimeInterval = 4.0

    // Created once — CIContext is expensive to allocate.
    private let ciContext = CIContext()

    private let urlSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.allowsCellularAccess = true
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    // ReplayKit delivers buffers serially, but the upload completion handler fires on
    // another thread, so guard the throttle/in-flight state with a lock.
    private let stateLock = NSLock()
    private var lastUploadAt: Date = .distantPast
    private var isUploading = false

    private lazy var frameURL: URL? = {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier)?
            .appendingPathComponent(Self.frameFileName)
    }()

    private var userPhone: String? {
        UserDefaults(suiteName: Self.appGroupIdentifier)?.string(forKey: Self.userPhoneKey)
    }

    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        stateLock.lock()
        lastUploadAt = .distantPast
        isUploading = false
        stateLock.unlock()
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

        // Throttle, and never overlap with an in-flight upload.
        let now = Date()
        stateLock.lock()
        let shouldUpload = !isUploading && now.timeIntervalSince(lastUploadAt) >= Self.uploadInterval
        if shouldUpload {
            isUploading = true
            lastUploadAt = now
        }
        stateLock.unlock()
        guard shouldUpload else { return }

        guard let jpegData = jpegData(from: sampleBuffer) else {
            finishUpload()
            return
        }

        // Write to the App Group too, so the app's foreground card still has a frame.
        if let frameURL {
            try? jpegData.write(to: frameURL, options: .atomic)
        }

        // No identity yet (the user hasn't tapped the deep link) — nothing to judge against.
        guard let phone = userPhone, !phone.isEmpty else {
            finishUpload()
            return
        }

        upload(jpegData: jpegData, userPhone: phone)
    }

    // MARK: - Helpers

    private func jpegData(from sampleBuffer: CMSampleBuffer) -> Data? {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return nil }
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return nil }
        return UIImage(cgImage: cgImage).jpegData(compressionQuality: Self.jpegQuality)
    }

    private func upload(jpegData: Data, userPhone: String) {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: Self.judgeURL)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = multipartBody(boundary: boundary, jpegData: jpegData, userPhone: userPhone)

        // Fire-and-forget: escalation (check-in / snitch) happens server-side, so the
        // extension doesn't need the response — just free the slot when it's done.
        let task = urlSession.dataTask(with: request) { [weak self] _, _, _ in
            self?.finishUpload()
        }
        task.resume()
    }

    private func finishUpload() {
        stateLock.lock()
        isUploading = false
        stateLock.unlock()
    }

    private func multipartBody(boundary: String, jpegData: Data, userPhone: String) -> Data {
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"userPhone\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(userPhone)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"frame.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpegData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return body
    }
}
