#import <AppKit/AppKit.h>
#import <CoreImage/CoreImage.h>
#import <CoreML/CoreML.h>
#import <Foundation/Foundation.h>
#import <Vision/Vision.h>

static NSString * const kCanvasWidth = @"1536";
static NSString * const kCanvasHeight = @"1728";
static const NSInteger CanvasWidth = 1536;
static const NSInteger CanvasHeight = 1728;

@interface AssetSpec : NSObject
@property(nonatomic, copy) NSString *folder;
@property(nonatomic, copy) NSString *sourceName;
@property(nonatomic, copy) NSString *outputName;
@property(nonatomic) CGFloat fitWidth;
@property(nonatomic) CGFloat fitHeight;
@property(nonatomic) CGFloat bottomMargin;
@property(nonatomic) CGFloat centerBiasX;
+ (instancetype)folder:(NSString *)folder
            sourceName:(NSString *)sourceName
            outputName:(NSString *)outputName
              fitWidth:(CGFloat)fitWidth
             fitHeight:(CGFloat)fitHeight
          bottomMargin:(CGFloat)bottomMargin
           centerBiasX:(CGFloat)centerBiasX;
@end

@implementation AssetSpec
+ (instancetype)folder:(NSString *)folder
            sourceName:(NSString *)sourceName
            outputName:(NSString *)outputName
              fitWidth:(CGFloat)fitWidth
             fitHeight:(CGFloat)fitHeight
          bottomMargin:(CGFloat)bottomMargin
           centerBiasX:(CGFloat)centerBiasX {
    AssetSpec *spec = [[AssetSpec alloc] init];
    spec.folder = folder;
    spec.sourceName = sourceName;
    spec.outputName = outputName;
    spec.fitWidth = fitWidth;
    spec.fitHeight = fitHeight;
    spec.bottomMargin = bottomMargin;
    spec.centerBiasX = centerBiasX;
    return spec;
}
@end

static CIContext *CISharedContext(void) {
    static CIContext *context = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        context = [CIContext contextWithOptions:nil];
    });
    return context;
}

static NSURL *Append(NSURL *base, NSString *component, BOOL directory) {
    return [base URLByAppendingPathComponent:component isDirectory:directory];
}

static BOOL EnsureDirectory(NSURL *url, NSError **error) {
    return [[NSFileManager defaultManager] createDirectoryAtURL:url withIntermediateDirectories:YES attributes:nil error:error];
}

static CGImageRef LoadCGImage(NSURL *url, NSError **error) CF_RETURNS_RETAINED {
    NSImage *image = [[NSImage alloc] initWithContentsOfURL:url];
    if (!image) {
        if (error) {
            *error = [NSError errorWithDomain:@"PA0" code:1 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"could not load image: %@", url.path]}];
        }
        return nil;
    }
    NSRect rect = NSMakeRect(0, 0, image.size.width, image.size.height);
    CGImageRef cgImage = [image CGImageForProposedRect:&rect context:nil hints:nil];
    if (!cgImage) {
        if (error) {
            *error = [NSError errorWithDomain:@"PA0" code:2 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"could not create CGImage: %@", url.path]}];
        }
        return nil;
    }
    return CGImageRetain(cgImage);
}

static NSMutableData *RGBABytesFromImage(CGImageRef image, NSInteger width, NSInteger height, NSError **error) {
    NSMutableData *data = [NSMutableData dataWithLength:width * height * 4];
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(
        data.mutableBytes,
        width,
        height,
        8,
        width * 4,
        colorSpace,
        kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big
    );
    CGColorSpaceRelease(colorSpace);

    if (!context) {
        if (error) {
            *error = [NSError errorWithDomain:@"PA0" code:3 userInfo:@{NSLocalizedDescriptionKey: @"could not create bitmap context"}];
        }
        return nil;
    }

    CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
    CGContextDrawImage(context, CGRectMake(0, 0, width, height), image);
    CGContextRelease(context);
    return data;
}

static CGImageRef ForegroundMask(CGImageRef image, NSURL *sourceURL, NSError **error) CF_RETURNS_RETAINED {
    NSInteger width = CGImageGetWidth(image);
    NSInteger height = CGImageGetHeight(image);

    if (@available(macOS 14.0, *)) {
        VNGenerateForegroundInstanceMaskRequest *request = [[VNGenerateForegroundInstanceMaskRequest alloc] init];
        for (id<MLComputeDeviceProtocol> device in MLAllComputeDevices()) {
            if ([device isKindOfClass:MLGPUComputeDevice.class]) {
                [request setComputeDevice:device forComputeStage:VNComputeStageMain];
                [request setComputeDevice:device forComputeStage:VNComputeStagePostProcessing];
                break;
            }
        }
        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
        NSError *foregroundError = nil;
        if ([handler performRequests:@[request] error:&foregroundError]) {
            VNInstanceMaskObservation *observation = request.results.firstObject;
            if (observation) {
                CVPixelBufferRef maskBuffer = [observation generateScaledMaskForImageForInstances:observation.allInstances fromRequestHandler:handler error:&foregroundError];
                if (maskBuffer) {
                    CIImage *maskImage = [CIImage imageWithCVPixelBuffer:maskBuffer];
                    CGRect rect = CGRectMake(0, 0, width, height);
                    CGImageRef mask = [CISharedContext() createCGImage:maskImage fromRect:rect];
                    CVPixelBufferRelease(maskBuffer);
                    if (mask) {
                        return mask;
                    }
                }
            }
        }
        fprintf(stderr, "WARN: foreground instance mask failed for %s; falling back to person segmentation (%s)\n", sourceURL.lastPathComponent.UTF8String, foregroundError.localizedDescription.UTF8String ?: "unknown error");
    }

    if (@available(macOS 12.0, *)) {
        VNGeneratePersonSegmentationRequest *personRequest = [[VNGeneratePersonSegmentationRequest alloc] init];
        personRequest.qualityLevel = VNGeneratePersonSegmentationRequestQualityLevelAccurate;
        personRequest.outputPixelFormat = kCVPixelFormatType_OneComponent8;
        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
        if (![handler performRequests:@[personRequest] error:error]) {
            return nil;
        }

        VNPixelBufferObservation *observation = personRequest.results.firstObject;
        if (!observation) {
            if (error) {
                *error = [NSError errorWithDomain:@"PA0" code:4 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"could not generate person mask: %@", sourceURL.path]}];
            }
            return nil;
        }

        CVPixelBufferRef maskBuffer = observation.pixelBuffer;
        CIImage *maskImage = [CIImage imageWithCVPixelBuffer:maskBuffer];
        CGRect extent = maskImage.extent;
        CGFloat scaleX = (CGFloat)width / extent.size.width;
        CGFloat scaleY = (CGFloat)height / extent.size.height;
        CIImage *scaledMask = [maskImage imageByApplyingTransform:CGAffineTransformMakeScale(scaleX, scaleY)];
        return [CISharedContext() createCGImage:scaledMask fromRect:CGRectMake(0, 0, width, height)];
    }

    if (error) {
        *error = [NSError errorWithDomain:@"PA0" code:5 userInfo:@{NSLocalizedDescriptionKey: @"foreground masks require macOS 12 or newer"}];
    }
    return nil;
}

static CGFloat ColorDistance(UInt8 r, UInt8 g, UInt8 b, CGFloat bgR, CGFloat bgG, CGFloat bgB) {
    CGFloat dr = (CGFloat)r - bgR;
    CGFloat dg = (CGFloat)g - bgG;
    CGFloat db = (CGFloat)b - bgB;
    return sqrt(dr * dr + dg * dg + db * db);
}

static BOOL InBox(NSInteger x, NSInteger y, NSInteger width, NSInteger height, CGFloat minX, CGFloat minY, CGFloat maxX, CGFloat maxY) {
    CGFloat nx = (CGFloat)x / (CGFloat)width;
    CGFloat ny = (CGFloat)y / (CGFloat)height;
    return nx >= minX && nx <= maxX && ny >= minY && ny <= maxY;
}

static BOOL InEllipse(NSInteger x, NSInteger y, NSInteger width, NSInteger height, CGFloat centerX, CGFloat centerY, CGFloat radiusX, CGFloat radiusY) {
    CGFloat nx = (CGFloat)x / (CGFloat)width;
    CGFloat ny = (CGFloat)y / (CGFloat)height;
    CGFloat dx = (nx - centerX) / radiusX;
    CGFloat dy = (ny - centerY) / radiusY;
    return dx * dx + dy * dy <= 1.0;
}

static UInt8 ExtraAlphaForState(AssetSpec *spec, NSInteger x, NSInteger y, NSInteger width, NSInteger height, UInt8 r, UInt8 g, UInt8 b, CGFloat bgR, CGFloat bgG, CGFloat bgB) {
    NSInteger maxChannel = MAX(r, MAX(g, b));
    NSInteger minChannel = MIN(r, MIN(g, b));
    NSInteger avg = (r + g + b) / 3;
    CGFloat distance = ColorDistance(r, g, b, bgR, bgG, bgB);

    if ([spec.folder isEqualToString:@"thinking"]) {
        if (InBox(x, y, width, height, 0.38, 0.03, 0.58, 0.28) && avg < 110) {
            return 255;
        }
    }

    if ([spec.folder isEqualToString:@"error"]) {
        if (InBox(x, y, width, height, 0.20, 0.04, 0.80, 0.34)) {
            BOOL greyCloud = avg < 205 && distance > 28 && labs((NSInteger)r - (NSInteger)g) < 30 && labs((NSInteger)g - (NSInteger)b) < 40;
            BOOL blueRain = b > r + 5 && b > g + 2 && avg > 120;
            if (greyCloud || blueRain) {
                return 230;
            }
        }
    }

    if ([spec.folder isEqualToString:@"success"]) {
        BOOL gold = r > 165 && g > 115 && b < 155 && (maxChannel - minChannel) > 35;
        BOOL brightSpark = avg > 245 && InBox(x, y, width, height, 0.00, 0.06, 1.00, 0.72);
        if (gold || brightSpark) {
            return 230;
        }
    }

    if ([spec.folder isEqualToString:@"sleep"]) {
        if (InBox(x, y, width, height, 0.03, 0.07, 0.42, 0.33) && avg < 120) {
            return 255;
        }
        BOOL cupBowl = InEllipse(x, y, width, height, 0.49, 0.66, 0.48, 0.27);
        BOOL cupSaucer = InEllipse(x, y, width, height, 0.52, 0.88, 0.48, 0.09);
        BOOL cupHandle = InEllipse(x, y, width, height, 0.88, 0.61, 0.16, 0.15);
        BOOL warmCupPixel = avg > 135 && avg < 252 && r >= b && distance > 8;
        if ((cupBowl || cupSaucer || cupHandle) && warmCupPixel) {
            return 215;
        }
    }

    return 0;
}

static void EstimateBackground(NSMutableData *sourceBytes, NSInteger width, NSInteger height, CGFloat *bgR, CGFloat *bgG, CGFloat *bgB) {
    UInt8 *sourcePtr = sourceBytes.mutableBytes;
    NSInteger border = MAX(12, MIN(width, height) / 24);
    CGFloat totalR = 0;
    CGFloat totalG = 0;
    CGFloat totalB = 0;
    CGFloat count = 0;

    for (NSInteger y = 0; y < height; y += 4) {
        for (NSInteger x = 0; x < width; x += 4) {
            if (x > border && x < width - border && y > border && y < height - border) {
                continue;
            }
            NSInteger index = (y * width + x) * 4;
            UInt8 r = sourcePtr[index];
            UInt8 g = sourcePtr[index + 1];
            UInt8 b = sourcePtr[index + 2];
            NSInteger maxChannel = MAX(r, MAX(g, b));
            NSInteger minChannel = MIN(r, MIN(g, b));
            if ((maxChannel - minChannel) > 80 || (r + g + b) / 3 < 80) {
                continue;
            }
            totalR += r;
            totalG += g;
            totalB += b;
            count += 1;
        }
    }

    if (count < 1) {
        *bgR = 232;
        *bgG = 218;
        *bgB = 204;
    } else {
        *bgR = totalR / count;
        *bgG = totalG / count;
        *bgB = totalB / count;
    }
}

static CGImageRef CreateCutout(CGImageRef source, CGImageRef mask, AssetSpec *spec, CGRect *bboxOut, NSError **error) CF_RETURNS_RETAINED {
    const NSInteger width = CGImageGetWidth(source);
    const NSInteger height = CGImageGetHeight(source);
    NSMutableData *sourceBytes = RGBABytesFromImage(source, width, height, error);
    if (!sourceBytes) {
        return nil;
    }
    NSMutableData *maskBytes = RGBABytesFromImage(mask, width, height, error);
    if (!maskBytes) {
        return nil;
    }

    NSMutableData *output = [NSMutableData dataWithLength:width * height * 4];
    UInt8 *sourcePtr = sourceBytes.mutableBytes;
    UInt8 *maskPtr = maskBytes.mutableBytes;
    UInt8 *outPtr = output.mutableBytes;
    CGFloat bgR = 0;
    CGFloat bgG = 0;
    CGFloat bgB = 0;
    EstimateBackground(sourceBytes, width, height, &bgR, &bgG, &bgB);
    NSInteger minX = width;
    NSInteger minY = height;
    NSInteger maxX = 0;
    NSInteger maxY = 0;

    for (NSInteger y = 0; y < height; y++) {
        for (NSInteger x = 0; x < width; x++) {
            NSInteger index = (y * width + x) * 4;
            NSInteger rawAlpha = maskPtr[index];
            UInt8 alpha = 0;
            if (rawAlpha < 12) {
                alpha = 0;
            } else if (rawAlpha > 240) {
                alpha = 255;
            } else {
                NSInteger adjusted = (rawAlpha - 8) * 255 / 232;
                alpha = (UInt8)MAX(0, MIN(255, adjusted));
            }

            UInt8 extraAlpha = ExtraAlphaForState(spec, x, y, width, height, sourcePtr[index], sourcePtr[index + 1], sourcePtr[index + 2], bgR, bgG, bgB);
            alpha = MAX(alpha, extraAlpha);

            if (alpha > 12) {
                minX = MIN(minX, x);
                minY = MIN(minY, y);
                maxX = MAX(maxX, x);
                maxY = MAX(maxY, y);
            }

            NSInteger a = alpha;
            outPtr[index] = (UInt8)(sourcePtr[index] * a / 255);
            outPtr[index + 1] = (UInt8)(sourcePtr[index + 1] * a / 255);
            outPtr[index + 2] = (UInt8)(sourcePtr[index + 2] * a / 255);
            outPtr[index + 3] = alpha;
        }
    }

    if (minX > maxX || minY > maxY) {
        *bboxOut = CGRectMake(0, 0, width, height);
    } else {
        CGFloat pad = 18.0;
        CGFloat x = MAX(0, minX - pad);
        CGFloat y = MAX(0, minY - pad);
        CGFloat maxWidth = width - x;
        CGFloat maxHeight = height - y;
        *bboxOut = CGRectIntegral(CGRectMake(x, y, MIN(maxWidth, (maxX - minX + 1) + pad * 2), MIN(maxHeight, (maxY - minY + 1) + pad * 2)));
    }

    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)output);
    CGImageRef image = CGImageCreate(
        width,
        height,
        8,
        32,
        width * 4,
        colorSpace,
        kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big,
        provider,
        NULL,
        true,
        kCGRenderingIntentDefault
    );
    CGDataProviderRelease(provider);
    CGColorSpaceRelease(colorSpace);
    return image;
}

static CGImageRef NormalizeImage(CGImageRef cutout, CGRect bbox, AssetSpec *spec, NSError **error) CF_RETURNS_RETAINED {
    CGFloat scale = MIN(spec.fitWidth / bbox.size.width, spec.fitHeight / bbox.size.height);
    CGFloat targetBBoxWidth = bbox.size.width * scale;
    CGFloat targetMinX = (CanvasWidth - targetBBoxWidth) / 2.0 + spec.centerBiasX;
    CGFloat targetMinY = spec.bottomMargin;
    CGFloat drawX = targetMinX - bbox.origin.x * scale;
    CGFloat drawY = targetMinY - bbox.origin.y * scale;
    CGFloat drawWidth = CGImageGetWidth(cutout) * scale;
    CGFloat drawHeight = CGImageGetHeight(cutout) * scale;

    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(
        NULL,
        CanvasWidth,
        CanvasHeight,
        8,
        CanvasWidth * 4,
        colorSpace,
        kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big
    );
    CGColorSpaceRelease(colorSpace);

    if (!context) {
        if (error) {
            *error = [NSError errorWithDomain:@"PA0" code:6 userInfo:@{NSLocalizedDescriptionKey: @"could not create output bitmap context"}];
        }
        return nil;
    }

    CGContextClearRect(context, CGRectMake(0, 0, CanvasWidth, CanvasHeight));
    CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
    CGContextDrawImage(context, CGRectMake(drawX, drawY, drawWidth, drawHeight), cutout);
    CGImageRef output = CGBitmapContextCreateImage(context);
    CGContextRelease(context);
    return output;
}

static BOOL SavePNG(CGImageRef image, NSURL *url, NSError **error) {
    NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:image];
    NSData *png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    if (!png) {
        if (error) {
            *error = [NSError errorWithDomain:@"PA0" code:7 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"could not encode PNG: %@", url.path]}];
        }
        return NO;
    }
    return [png writeToURL:url options:NSDataWritingAtomic error:error];
}

static NSURL *ImageURL(NSURL *keyframeRoot, NSString *folder, NSString *name) {
    return Append(Append(keyframeRoot, folder, YES), name, NO);
}

static BOOL CopyRawSourceIfNeeded(NSURL *rawRoot, NSURL *sourceURL, AssetSpec *spec, NSError **error) {
    NSURL *folderURL = Append(rawRoot, spec.folder, YES);
    if (!EnsureDirectory(folderURL, error)) {
        return NO;
    }
    NSURL *destination = Append(folderURL, spec.sourceName, NO);
    if (![[NSFileManager defaultManager] fileExistsAtPath:destination.path]) {
        return [[NSFileManager defaultManager] copyItemAtURL:sourceURL toURL:destination error:error];
    }
    return YES;
}

static BOOL ProcessAsset(NSURL *keyframeRoot, NSURL *rawRoot, AssetSpec *spec, NSError **error) {
    NSArray<NSURL *> *candidates = @[
        ImageURL(rawRoot, spec.folder, spec.sourceName),
        ImageURL(rawRoot, spec.folder, spec.outputName),
        ImageURL(keyframeRoot, spec.folder, spec.sourceName),
        ImageURL(keyframeRoot, spec.folder, spec.outputName),
    ];

    NSURL *sourceURL = nil;
    for (NSURL *candidate in candidates) {
        if ([[NSFileManager defaultManager] fileExistsAtPath:candidate.path]) {
            sourceURL = candidate;
            break;
        }
    }
    if (!sourceURL) {
        if (error) {
            *error = [NSError errorWithDomain:@"PA0" code:8 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"missing source for %@/%@", spec.folder, spec.sourceName]}];
        }
        return NO;
    }

    if (!CopyRawSourceIfNeeded(rawRoot, sourceURL, spec, error)) {
        return NO;
    }

    CGImageRef source = LoadCGImage(sourceURL, error);
    if (!source) {
        return NO;
    }
    CGImageRef mask = ForegroundMask(source, sourceURL, error);
    if (!mask) {
        CGImageRelease(source);
        return NO;
    }

    CGRect bbox = CGRectZero;
    CGImageRef cutout = CreateCutout(source, mask, spec, &bbox, error);
    CGImageRelease(source);
    CGImageRelease(mask);
    if (!cutout) {
        return NO;
    }

    CGImageRef normalized = NormalizeImage(cutout, bbox, spec, error);
    CGImageRelease(cutout);
    if (!normalized) {
        return NO;
    }

    NSURL *outputURL = ImageURL(keyframeRoot, spec.folder, spec.outputName);
    if (!EnsureDirectory(outputURL.URLByDeletingLastPathComponent, error)) {
        CGImageRelease(normalized);
        return NO;
    }
    BOOL saved = SavePNG(normalized, outputURL, error);
    CGImageRelease(normalized);
    if (!saved) {
        return NO;
    }

    NSURL *legacyURL = ImageURL(keyframeRoot, spec.folder, spec.sourceName);
    if (![spec.sourceName isEqualToString:spec.outputName] && [[NSFileManager defaultManager] fileExistsAtPath:legacyURL.path]) {
        if (![[NSFileManager defaultManager] removeItemAtURL:legacyURL error:error]) {
            return NO;
        }
    }

    printf("processed %s/%s (%sx%s)\n", spec.folder.UTF8String, spec.outputName.UTF8String, kCanvasWidth.UTF8String, kCanvasHeight.UTF8String);
    return YES;
}

static void DrawCheckerboard(CGContextRef context, CGRect rect) {
    CGFloat tile = 24.0;
    CGColorRef light = [NSColor colorWithCalibratedWhite:0.93 alpha:1.0].CGColor;
    CGColorRef dark = [NSColor colorWithCalibratedWhite:0.80 alpha:1.0].CGColor;
    NSInteger rows = (NSInteger)ceil(rect.size.height / tile);
    NSInteger cols = (NSInteger)ceil(rect.size.width / tile);
    for (NSInteger y = 0; y < rows; y++) {
        for (NSInteger x = 0; x < cols; x++) {
            CGContextSetFillColorWithColor(context, ((x + y) % 2 == 0) ? light : dark);
            CGContextFillRect(context, CGRectMake(rect.origin.x + x * tile, rect.origin.y + y * tile, tile, tile));
        }
    }
}

static BOOL MakeContactSheet(NSURL *keyframeRoot, NSURL *qaOutput, NSArray<AssetSpec *> *assets, NSError **error) {
    NSInteger columns = 4;
    NSInteger cellWidth = 360;
    NSInteger cellHeight = 470;
    NSInteger labelHeight = 46;
    NSInteger padding = 24;
    NSInteger rows = (assets.count + columns - 1) / columns;
    NSInteger sheetWidth = padding + columns * (cellWidth + padding);
    NSInteger sheetHeight = padding + rows * (cellHeight + labelHeight + padding);

    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGContextRef context = CGBitmapContextCreate(
        NULL,
        sheetWidth,
        sheetHeight,
        8,
        sheetWidth * 4,
        colorSpace,
        kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big
    );
    CGColorSpaceRelease(colorSpace);
    if (!context) {
        if (error) {
            *error = [NSError errorWithDomain:@"PA0" code:9 userInfo:@{NSLocalizedDescriptionKey: @"could not create contact sheet context"}];
        }
        return NO;
    }

    CGContextSetFillColorWithColor(context, NSColor.whiteColor.CGColor);
    CGContextFillRect(context, CGRectMake(0, 0, sheetWidth, sheetHeight));
    NSGraphicsContext *graphicsContext = [NSGraphicsContext graphicsContextWithCGContext:context flipped:NO];

    for (NSInteger index = 0; index < assets.count; index++) {
        AssetSpec *spec = assets[index];
        NSInteger col = index % columns;
        NSInteger row = rows - 1 - index / columns;
        CGFloat cellX = padding + col * (cellWidth + padding);
        CGFloat cellY = padding + row * (cellHeight + labelHeight + padding) + labelHeight;
        CGRect cell = CGRectMake(cellX, cellY, cellWidth, cellHeight);
        DrawCheckerboard(context, cell);

        CGImageRef image = LoadCGImage(ImageURL(keyframeRoot, spec.folder, spec.outputName), error);
        if (!image) {
            CGContextRelease(context);
            return NO;
        }
        CGFloat scale = MIN((CGFloat)cellWidth / CGImageGetWidth(image), (CGFloat)cellHeight / CGImageGetHeight(image));
        CGFloat drawWidth = CGImageGetWidth(image) * scale;
        CGFloat drawHeight = CGImageGetHeight(image) * scale;
        CGRect drawRect = CGRectMake(cellX + (cellWidth - drawWidth) / 2.0, cellY + (cellHeight - drawHeight) / 2.0, drawWidth, drawHeight);
        CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
        CGContextDrawImage(context, drawRect, image);
        CGImageRelease(image);

        CGContextSetStrokeColorWithColor(context, [NSColor colorWithCalibratedWhite:0.62 alpha:1.0].CGColor);
        CGContextStrokeRectWithWidth(context, cell, 1.0);

        NSString *label = [NSString stringWithFormat:@"%@/%@", spec.folder, spec.outputName];
        NSDictionary *attrs = @{
            NSFontAttributeName: [NSFont monospacedSystemFontOfSize:15 weight:NSFontWeightRegular],
            NSForegroundColorAttributeName: NSColor.blackColor,
        };
        [NSGraphicsContext saveGraphicsState];
        [NSGraphicsContext setCurrentContext:graphicsContext];
        [label drawAtPoint:NSMakePoint(cellX, cellY - 32) withAttributes:attrs];
        [NSGraphicsContext restoreGraphicsState];
    }

    CGImageRef sheet = CGBitmapContextCreateImage(context);
    CGContextRelease(context);
    if (!sheet) {
        if (error) {
            *error = [NSError errorWithDomain:@"PA0" code:10 userInfo:@{NSLocalizedDescriptionKey: @"could not create contact sheet image"}];
        }
        return NO;
    }
    BOOL saved = SavePNG(sheet, qaOutput, error);
    CGImageRelease(sheet);
    if (saved) {
        printf("wrote %s\n", qaOutput.path.UTF8String);
    }
    return saved;
}

static void RemoveDSStoreFiles(NSURL *root) {
    NSDirectoryEnumerator<NSURL *> *enumerator = [[NSFileManager defaultManager] enumeratorAtURL:root includingPropertiesForKeys:nil options:0 errorHandler:nil];
    for (NSURL *url in enumerator) {
        if ([url.lastPathComponent isEqualToString:@".DS_Store"]) {
            [[NSFileManager defaultManager] removeItemAtURL:url error:nil];
            NSString *relative = [url.path stringByReplacingOccurrencesOfString:[root.path stringByAppendingString:@"/"] withString:@""];
            printf("removed %s\n", relative.UTF8String);
        }
    }
}

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSURL *root = [NSURL fileURLWithPath:NSFileManager.defaultManager.currentDirectoryPath isDirectory:YES];
        NSURL *keyframeRoot = Append(root, @"assets/keyframes", YES);
        NSURL *rawRoot = Append(root, @"assets/character/reference/pa0_raw", YES);
        NSURL *qaOutput = Append(root, @"docs/pa0/qa_keyframes_contact.png", NO);
        NSArray<AssetSpec *> *assets = @[
            [AssetSpec folder:@"idle" sourceName:@"idle_01.png" outputName:@"idle_01.png" fitWidth:880 fitHeight:1628 bottomMargin:42 centerBiasX:0],
            [AssetSpec folder:@"idle" sourceName:@"idle_02.png" outputName:@"idle_02.png" fitWidth:880 fitHeight:1628 bottomMargin:42 centerBiasX:0],
            [AssetSpec folder:@"idle_reading" sourceName:@"reading_01.png" outputName:@"idle_reading_01.png" fitWidth:980 fitHeight:1608 bottomMargin:48 centerBiasX:0],
            [AssetSpec folder:@"idle_yawn" sourceName:@"yawn_01.png" outputName:@"idle_yawn_01.png" fitWidth:880 fitHeight:1628 bottomMargin:42 centerBiasX:0],
            [AssetSpec folder:@"idle_hair" sourceName:@"hair_01.png" outputName:@"idle_hair_01.png" fitWidth:880 fitHeight:1628 bottomMargin:42 centerBiasX:0],
            [AssetSpec folder:@"coding" sourceName:@"coding_01.png" outputName:@"coding_01.png" fitWidth:1320 fitHeight:1460 bottomMargin:90 centerBiasX:0],
            [AssetSpec folder:@"thinking" sourceName:@"thinking_01.png" outputName:@"thinking_01.png" fitWidth:1450 fitHeight:1160 bottomMargin:190 centerBiasX:0],
            [AssetSpec folder:@"success" sourceName:@"sucess_01.png" outputName:@"success_01.png" fitWidth:1180 fitHeight:1628 bottomMargin:44 centerBiasX:0],
            [AssetSpec folder:@"error" sourceName:@"error_1.png" outputName:@"error_01.png" fitWidth:1180 fitHeight:1440 bottomMargin:105 centerBiasX:0],
            [AssetSpec folder:@"reminder" sourceName:@"reminder_01.png" outputName:@"reminder_01.png" fitWidth:940 fitHeight:1628 bottomMargin:42 centerBiasX:-70],
            [AssetSpec folder:@"sleep" sourceName:@"sleep_01.png" outputName:@"sleep_01.png" fitWidth:1340 fitHeight:1390 bottomMargin:120 centerBiasX:0],
        ];

        NSError *error = nil;
        if (!EnsureDirectory(rawRoot, &error)) {
            fprintf(stderr, "PA0 processing failed: %s\n", error.localizedDescription.UTF8String);
            return 1;
        }
        for (AssetSpec *spec in assets) {
            if (!ProcessAsset(keyframeRoot, rawRoot, spec, &error)) {
                fprintf(stderr, "PA0 processing failed: %s\n", error.localizedDescription.UTF8String);
                return 1;
            }
        }
        RemoveDSStoreFiles(root);
        if (!MakeContactSheet(keyframeRoot, qaOutput, assets, &error)) {
            fprintf(stderr, "PA0 processing failed: %s\n", error.localizedDescription.UTF8String);
            return 1;
        }
    }
    return 0;
}
