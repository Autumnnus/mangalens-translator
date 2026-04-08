import React, { useEffect, useRef, useState } from "react";
// Swiper imports
import type { Swiper as SwiperType } from "swiper";
import { FreeMode, Navigation, Thumbs, Virtual, Zoom } from "swiper/modules";
import { Swiper, SwiperRef, SwiperSlide } from "swiper/react";

// Swiper styles
import "swiper/css";
import "swiper/css/free-mode";
import "swiper/css/navigation";
import "swiper/css/thumbs";
import "swiper/css/virtual";
import "swiper/css/zoom";

import { ProcessedImage, ViewMode } from "../../types";
import { getThumbnailUrl } from "../../utils/url";
import ComparisonView from "../ComparisonView";

interface ReaderImageAreaProps {
  images: ProcessedImage[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  showComparison: boolean;
  comparisonMode: ViewMode;
  onToggleUI: () => void;
  isUIVisible: boolean;
}

const ReaderImageArea: React.FC<ReaderImageAreaProps> = ({
  images,
  currentIndex,
  onIndexChange,
  showComparison,
  comparisonMode,
  onToggleUI,
  isUIVisible,
}) => {
  const swiperRef = useRef<SwiperRef>(null);
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const preloadedRef = useRef<Set<string>>(new Set());

  // Sync external index change to Swiper
  useEffect(() => {
    if (swiperRef.current && swiperRef.current.swiper) {
      if (swiperRef.current.swiper.activeIndex !== currentIndex) {
        swiperRef.current.swiper.slideTo(currentIndex);
      }
    }
  }, [currentIndex]);

  // Preload only a small number of upcoming pages and skip on slow/data-save connections.
  useEffect(() => {
    if (!images || images.length === 0) return;
    let preloadNext = 4;
    let preloadBack = 1;

    if (typeof navigator !== "undefined") {
      type NetworkInformation = {
        saveData?: boolean;
        effectiveType?: string;
      };
      const connection = (
        navigator as Navigator & { connection?: NetworkInformation }
      ).connection;
      if (
        connection?.saveData ||
        connection?.effectiveType === "2g" ||
        connection?.effectiveType === "slow-2g"
      ) {
        return;
      }

      if (connection?.effectiveType === "3g") {
        preloadNext = 2;
        preloadBack = 1;
      }
    }

    const startIndex = Math.max(0, currentIndex - preloadBack);
    const endIndex = Math.min(currentIndex + preloadNext, images.length - 1);

    for (let i = startIndex; i <= endIndex; i++) {
      const img = images[i];
      const url = img.translatedUrl || img.originalUrl;
      if (!url || preloadedRef.current.has(url)) continue;
      preloadedRef.current.add(url);
      const preloader = new Image();
      preloader.decoding = "async";
      preloader.src = url;
    }
  }, [currentIndex, images]);

  const getPair = (img: ProcessedImage) => ({
    id: img.id,
    title: img.fileName,
    sourceUrl: img.originalUrl,
    convertedUrl: img.translatedUrl || img.originalUrl,
    createdAt: 0,
  });

  return (
    <div
      className={`flex-1 w-full h-full min-h-0 flex flex-col relative bg-black transition-colors duration-500 ${
        isUIVisible ? "bg-background/20" : "bg-black"
      }`}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .swiper {
              width: 100%;
              height: 100%;
            }
            .swiper-slide {
              overflow: hidden;
            }
            .swiper-zoom-container {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .swiper-button-next, .swiper-button-prev {
                color: rgba(255, 255, 255, 0.5);
                transition: color 0.2s;
            }
            .swiper-button-next:hover, .swiper-button-prev:hover {
                color: rgba(255, 255, 255, 1);
            }
            
            /* Main Swiper - takes available space */
            .main-swiper {
                flex: 1;
                min-height: 0;
            }
            
            /* Thumbs Swiper - fixed height at bottom */
            .thumbs-swiper {
                height: 86px;
                flex-shrink: 0;
                background: rgba(0,0,0,0.5);
                padding: 8px 0;
                transition: height 0.3s, opacity 0.3s, padding 0.3s;
                border-top: 1px solid rgba(255,255,255,0.1);
            }

            @media (min-width: 640px) {
                .thumbs-swiper {
                    height: 100px;
                    padding: 10px 0;
                }
            }
            
            .thumbs-swiper.hidden-thumbs {
                height: 0;
                padding: 0;
                opacity: 0;
                pointer-events: none;
                border: none;
            }

            .thumbs-swiper .swiper-slide {
                width: 25%;
                height: 100%;
                opacity: 0.4;
                transition: opacity 0.3s;
                cursor: pointer;
                border-radius: 8px;
                overflow: hidden;
                box-sizing: border-box;
            }
            
            .thumbs-swiper .swiper-slide-thumb-active {
                opacity: 1;
                border: 2px solid var(--primary, #3b82f6);
            }
            
            .thumbs-swiper .swiper-slide img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                display: block;
                background: rgba(0,0,0,0.8);
                padding: 2px;
            }
        `,
        }}
      />

      <div className="flex-1 min-h-0 w-full relative">
        <Swiper
          ref={swiperRef}
          modules={[Zoom, Virtual, Navigation, Thumbs]}
          spaceBetween={20}
          slidesPerView={1}
          zoom={{
            maxRatio: 3,
            minRatio: 1,
            toggle: true,
          }}
          navigation={!isUIVisible ? false : true}
          virtual={{
            addSlidesAfter: 3,
            addSlidesBefore: 2,
          }}
          thumbs={{
            swiper:
              thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
          }}
          onSlideChange={(swiper) => onIndexChange(swiper.activeIndex)}
          onClick={() => {
            onToggleUI();
          }}
          className="mySwiper main-swiper"
          initialSlide={currentIndex}
        >
          {images.map((img, index) => {
            const displayUrl = img.translatedUrl || img.originalUrl;
            return (
              <SwiperSlide key={img.id} virtualIndex={index}>
                <div className="swiper-zoom-container w-full h-full flex items-center justify-center">
                  {showComparison && img.translatedUrl ? (
                    <div className="w-full h-full max-w-5xl mx-auto p-4 md:p-8 flex items-center justify-center pointer-events-auto swiper-no-swiping">
                      <ComparisonView
                        pair={getPair(img)}
                        mode={comparisonMode}
                        interactive={true}
                      />
                    </div>
                  ) : (
                    <img
                      src={displayUrl}
                      alt={img.fileName}
                      className="max-w-full max-h-full object-contain select-none"
                      loading={Math.abs(index - currentIndex) <= 1 ? "eager" : "lazy"}
                      decoding="async"
                      /* @ts-expect-error - fetchpriority is a valid web standard but may not be in all TS versions */
                      fetchpriority={
                        index === currentIndex
                          ? "high"
                          : Math.abs(index - currentIndex) <= 2
                            ? "auto"
                            : "low"
                      }
                      draggable={false}
                    />
                  )}
                </div>
              </SwiperSlide>
            );
          })}
        </Swiper>
      </div>

      <Swiper
        onSwiper={setThumbsSwiper}
        spaceBetween={10}
        slidesPerView={5}
        freeMode={true}
        watchSlidesProgress={true}
        modules={[FreeMode, Navigation, Thumbs, Virtual]}
        virtual={true}
        className={`mySwiper thumbs-swiper ${!isUIVisible ? "hidden-thumbs" : ""}`}
        breakpoints={{
          320: { slidesPerView: 4, spaceBetween: 5 },
          640: { slidesPerView: 6, spaceBetween: 10 },
          1024: { slidesPerView: 8, spaceBetween: 10 },
        }}
      >
        {images.map((img, index) => (
          <SwiperSlide key={`thumb-${img.id}`} virtualIndex={index}>
            <img
              src={getThumbnailUrl(img.originalKey, img.originalUrl, 220, 68)}
              alt={`Thumb ${index + 1}`}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-contain bg-black/80 p-0.5"
            />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
};
export default React.memo(ReaderImageArea);
