'use client'

import Image from 'next/image'
import styles from './LocalizationLoader.module.css'
import SectorFaIcon from '@/components/localizationLoader/SectorFaIcon'
import {
  LOCALIZATION_LOADER_SECTORS,
  sectorPosition,
} from '@/components/localizationLoader/sectors'

type LocalizationLoaderProps = {
  visible?: boolean
}

export default function LocalizationLoader({ visible = true }: LocalizationLoaderProps) {
  if (!visible) return null

  return (
    <div
      className="flex flex-col items-center justify-center pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className={styles.scene}>
        <svg
          className={styles.svgLayer}
          viewBox="0 0 400 400"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="lhCenterGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00A896" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#00A896" stopOpacity="0" />
            </radialGradient>
            <filter id="lhNeonBlurWide" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="10" />
            </filter>
            <filter id="lhNeonBlur" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>

          <circle
            cx="200"
            cy="200"
            r="110"
            fill="url(#lhCenterGlow)"
            className={styles.centerGlow}
          />
          <circle
            cx="200"
            cy="200"
            r="145"
            fill="none"
            stroke="#94A3B8"
            strokeOpacity="0.16"
            strokeWidth="1.5"
          />
          <circle
            cx="200"
            cy="200"
            r="151"
            fill="none"
            stroke="#00A896"
            strokeOpacity="0.12"
            strokeWidth="1"
          />

          <circle
            cx="200"
            cy="200"
            r="145"
            fill="none"
            stroke="#00E5FF"
            strokeWidth="13"
            opacity="0.24"
            filter="url(#lhNeonBlurWide)"
            className={styles.neonSweepSoft}
          />
          <circle
            cx="200"
            cy="200"
            r="145"
            fill="none"
            stroke="#00D9FF"
            strokeWidth="7"
            opacity="0.72"
            filter="url(#lhNeonBlur)"
            className={styles.neonSweep}
          />
          <circle
            cx="200"
            cy="200"
            r="145"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.8"
            strokeLinecap="round"
            className={styles.neonSweepCore}
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className={styles.hubDisc}>
            <Image
              src="/localization-hub-loader-logo.webp"
              alt="Localization Hub"
              width={122}
              height={112}
              className={styles.logoHub}
              priority
              draggable={false}
            />
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none">
          {LOCALIZATION_LOADER_SECTORS.map((sector) => {
            const { leftPercent, topPercent } = sectorPosition(sector.angle)
            return (
              <div
                key={sector.id}
                className={styles.sectorWrapper}
                style={{
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                }}
              >
                <div
                  className={styles.sectorCircle}
                  style={{
                    backgroundColor: sector.color,
                    // CSS variable used by reference loader for glow semantics
                    ['--node-color' as string]: sector.color,
                  }}
                >
                  <SectorFaIcon icon={sector.icon} className={styles.sectorIcon} />
                </div>
                <span className={styles.sectorLabel}>{sector.name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
