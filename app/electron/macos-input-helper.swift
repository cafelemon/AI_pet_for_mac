import AppKit
import CoreGraphics
import Foundation

struct HitBounds {
  let x: Double
  let y: Double
  let width: Double
  let height: Double

  func contains(_ point: CGPoint) -> Bool {
    point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height
  }
}

struct HitRegion {
  let x: Double
  let y: Double
  let width: Double
  let height: Double

  func contains(local point: CGPoint) -> Bool {
    let padding = 8.0
    return point.x >= x - padding &&
      point.x <= x + width + padding &&
      point.y >= y - padding &&
      point.y <= y + height + padding
  }
}

final class SharedState {
  private let lock = NSLock()
  private var modifier: CGEventFlags = .maskAlternate
  private var bounds: HitBounds?
  private var regions: [HitRegion] = []
  private var dragging = false
  private var suppressRightUp = false
  private var inputBuffer = ""

  func updateFromInput(_ chunk: String) {
    lock.lock()
    inputBuffer += chunk
    let parts = inputBuffer.components(separatedBy: "\n")
    inputBuffer = parts.last ?? ""
    lock.unlock()

    for line in parts.dropLast() {
      parseLine(line.trimmingCharacters(in: .whitespacesAndNewlines))
    }
  }

  func flagsMatch(_ flags: CGEventFlags) -> Bool {
    lock.lock()
    let required = modifier
    lock.unlock()

    return flags.contains(required)
  }

  func hitTest(_ point: CGPoint) -> Bool {
    lock.lock()
    let currentBounds = bounds
    let currentRegions = regions
    lock.unlock()

    guard let currentBounds, currentBounds.contains(point) else {
      return false
    }

    if currentRegions.isEmpty {
      return true
    }

    let localPoint = CGPoint(x: point.x - currentBounds.x, y: point.y - currentBounds.y)
    return currentRegions.contains { $0.contains(local: localPoint) }
  }

  func beginDrag() {
    lock.lock()
    dragging = true
    lock.unlock()
  }

  func endDrag() {
    lock.lock()
    dragging = false
    lock.unlock()
  }

  func isDragging() -> Bool {
    lock.lock()
    let value = dragging
    lock.unlock()
    return value
  }

  func markSuppressRightUp() {
    lock.lock()
    suppressRightUp = true
    lock.unlock()
  }

  func consumeSuppressRightUp() -> Bool {
    lock.lock()
    let value = suppressRightUp
    suppressRightUp = false
    lock.unlock()
    return value
  }

  private func parseLine(_ line: String) {
    guard !line.isEmpty, let data = line.data(using: .utf8) else {
      return
    }

    guard
      let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let type = payload["type"] as? String
    else {
      return
    }

    switch type {
    case "config":
      if let modifierName = payload["modifier"] as? String {
        lock.lock()
        modifier = modifierFlags(from: modifierName)
        lock.unlock()
      }
    case "regions":
      let nextBounds = parseBounds(payload["bounds"])
      let nextRegions = (payload["regions"] as? [[String: Any]] ?? []).compactMap(parseRegion)
      lock.lock()
      bounds = nextBounds
      regions = nextRegions
      lock.unlock()
    default:
      return
    }
  }
}

func modifierFlags(from value: String) -> CGEventFlags {
  switch value.lowercased() {
  case "command", "cmd", "meta":
    return .maskCommand
  case "control", "ctrl":
    return .maskControl
  case "shift":
    return .maskShift
  case "option", "alt":
    return .maskAlternate
  default:
    return .maskAlternate
  }
}

func parseBounds(_ value: Any?) -> HitBounds? {
  guard let dictionary = value as? [String: Any] else {
    return nil
  }

  guard
    let x = numberValue(dictionary["x"]),
    let y = numberValue(dictionary["y"]),
    let width = numberValue(dictionary["width"]),
    let height = numberValue(dictionary["height"])
  else {
    return nil
  }

  return HitBounds(x: x, y: y, width: width, height: height)
}

func parseRegion(_ dictionary: [String: Any]) -> HitRegion? {
  guard
    let x = numberValue(dictionary["x"]),
    let y = numberValue(dictionary["y"]),
    let width = numberValue(dictionary["width"]),
    let height = numberValue(dictionary["height"])
  else {
    return nil
  }

  return HitRegion(x: x, y: y, width: width, height: height)
}

func numberValue(_ value: Any?) -> Double? {
  if let value = value as? Double {
    return value
  }
  if let value = value as? Int {
    return Double(value)
  }
  if let value = value as? NSNumber {
    return value.doubleValue
  }
  return nil
}

func emit(_ payload: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: payload) else {
    return
  }

  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
}

let sharedState = SharedState()

FileHandle.standardInput.readabilityHandler = { handle in
  let data = handle.availableData
  if data.isEmpty {
    exit(0)
  }

  if let chunk = String(data: data, encoding: .utf8) {
    sharedState.updateFromInput(chunk)
  }
}

let eventMask =
  (1 << CGEventType.leftMouseDown.rawValue) |
  (1 << CGEventType.leftMouseDragged.rawValue) |
  (1 << CGEventType.leftMouseUp.rawValue) |
  (1 << CGEventType.rightMouseDown.rawValue) |
  (1 << CGEventType.rightMouseUp.rawValue)

let callback: CGEventTapCallBack = { _, type, event, userInfo in
  guard let userInfo else {
    return Unmanaged.passUnretained(event)
  }

  let state = Unmanaged<SharedState>.fromOpaque(userInfo).takeUnretainedValue()
  let location = event.location

  switch type {
  case .leftMouseDown:
    guard state.flagsMatch(event.flags), state.hitTest(location) else {
      return Unmanaged.passUnretained(event)
    }
    state.beginDrag()
    emit(["type": "leftDown", "x": location.x, "y": location.y])
    return nil
  case .leftMouseDragged:
    guard state.isDragging() else {
      return Unmanaged.passUnretained(event)
    }
    emit(["type": "leftDragged", "x": location.x, "y": location.y])
    return nil
  case .leftMouseUp:
    guard state.isDragging() else {
      return Unmanaged.passUnretained(event)
    }
    state.endDrag()
    emit(["type": "leftUp", "x": location.x, "y": location.y])
    return nil
  case .rightMouseDown:
    guard state.flagsMatch(event.flags), state.hitTest(location) else {
      return Unmanaged.passUnretained(event)
    }
    state.markSuppressRightUp()
    emit(["type": "rightDown", "x": location.x, "y": location.y])
    return nil
  case .rightMouseUp:
    if state.consumeSuppressRightUp() {
      return nil
    }
    return Unmanaged.passUnretained(event)
  default:
    return Unmanaged.passUnretained(event)
  }
}

let userInfo = Unmanaged.passUnretained(sharedState).toOpaque()
guard
  let eventTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: CGEventMask(eventMask),
    callback: callback,
    userInfo: userInfo
  )
else {
  emit(["type": "permission", "status": "denied"])
  exit(2)
}

emit(["type": "permission", "status": "granted"])

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: eventTap, enable: true)
CFRunLoopRun()
