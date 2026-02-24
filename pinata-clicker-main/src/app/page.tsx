'use client';

import '../../instrumentation-client';
import * as Sentry from '@sentry/nextjs';
import { type ReactElement, useCallback, useRef, useState } from 'react';

import { PinataClicker, type PinataClickerHandle, type PinataClickerProps } from './components/pinata-clicker/PinataClicker';


const CONFETTI_IMAGES = [
  '/pinata/confetti/c-01.png',
  '/pinata/confetti/c-02.png',
  '/pinata/confetti/c-03.png',
  '/pinata/confetti/c-04.png',
  '/pinata/confetti/c-05.png',
  '/pinata/confetti/c-06.png',
  '/pinata/confetti/c-07.png',
  '/pinata/confetti/c-08.png',
  '/pinata/confetti/c-09.png',
] as const;

const HITS_TO_DESTROY = 30;
const RESULT_BUTTON_IMMUNITY_MS = 2500;
const { logger } = Sentry;

export default function Home(): ReactElement {
  const clickerRef = useRef<PinataClickerHandle | null>(null);
  const [hits, setHits] = useState(0);
  const [paused, setPaused] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'running' | 'completed'>('idle');
  const [showResult, setShowResult] = useState(false);
  const resultButtonClickableAtRef = useRef(0);

  const handleTargetKicked = useCallback<NonNullable<PinataClickerProps['onTargetKicked']>>((detail) => {
    Sentry.startSpan(
      {
        op: 'game.event',
        name: 'pinata.targetKicked',
      },
      (span) => {
        span.setAttribute('pinata.hits', detail.hits);
        span.setAttribute('pinata.direction', detail.direction);
        span.setAttribute('pinata.force.x', detail.force.x);
        span.setAttribute('pinata.force.y', detail.force.y);
        span.setAttribute('pinata.position.x', detail.position.x);
        span.setAttribute('pinata.position.y', detail.position.y);
        logger.info('Target kicked', detail);
        setHits(detail.hits);
      },
    );
  }, []);

  const handleTargetDestroyed = useCallback<NonNullable<PinataClickerProps['onTargetDestroyed']>>((detail) => {
    Sentry.startSpan(
      {
        op: 'game.event',
        name: 'pinata.targetDestroyed',
      },
      (span) => {
        span.setAttribute('pinata.hits', detail.hits);
        span.setAttribute('pinata.scene.width', detail.scene.width);
        span.setAttribute('pinata.scene.height', detail.scene.height);
        logger.info('Target destroyed', detail);
        setHits(detail.hits);
        setPhase('completed');
        setShowResult(true);
        resultButtonClickableAtRef.current = Date.now() + RESULT_BUTTON_IMMUNITY_MS;
      },
    );
  }, [resultButtonClickableAtRef]);

  const handleStart = useCallback(() => {
    Sentry.startSpan(
      {
        op: 'ui.click',
        name: 'pinata.startButton',
      },
      (span) => {
        span.setAttribute('pinata.paused', paused);
        span.setAttribute('pinata.phase', phase);
        if (!paused || phase === 'completed') {
          logger.warn('Ignored start click because phase is locked', { paused, phase });
          return;
        }
        clickerRef.current?.resume();
        clickerRef.current?.hit();
        setPaused(false);
        setPhase('running');
        setShowResult(false);
        resultButtonClickableAtRef.current = 0;
        logger.info('Pinata round started');
      },
    );
  }, [paused, phase, resultButtonClickableAtRef]);

  const handleResultButtonClick = useCallback(() => {
    Sentry.startSpan(
      {
        op: 'ui.click',
        name: 'pinata.resultButton',
      },
      (span) => {
        const now = Date.now();
        span.setAttribute('pinata.result.allowedAt', resultButtonClickableAtRef.current);
        span.setAttribute('pinata.result.now', now);
        if (now < resultButtonClickableAtRef.current) {
          logger.debug(
            logger.fmt`Result button ignored because cooldown has ${resultButtonClickableAtRef.current - now}ms remaining`,
          );
          return;
        }
        setShowResult(false);
        resultButtonClickableAtRef.current = 0;
        logger.info('Result overlay dismissed');
      },
    );
  }, [resultButtonClickableAtRef, setShowResult]);

  return (
    <main className="pinata-page">
      <div className="container">
        <section className="pinata-wrapper">
          <PinataClicker
            ref={clickerRef}
            className="pinata-widget"
            confettiImages={[...CONFETTI_IMAGES]}
            hitsToDestroy={HITS_TO_DESTROY}
            burstEvery={10}
            targetImage="/pinata/horse.png"
            targetImageHit="/pinata/horse_hit.png"
            targetDestroyedImage="/pinata/horse_destroyed.png"
            bonusImage="/pinata/bonus.png"
            targetScaleDownFactor={0.97}
            paused={paused}
            onTargetKicked={handleTargetKicked}
            onTargetDestroyed={handleTargetDestroyed}
          />

          <div className={`pinata-wave${phase === 'running' ? ' play' : ''}`}></div>

          {phase === 'idle' && (
            <button className="button button-start" type="button" onClick={handleStart}>
              <img src="/button-start.png" height="44" width="114" alt="Start"/>
            </button>
          )}

          {phase === 'running' && (
            <div className="pinata-progress-wrapper">
              <progress
                className="pinata-progress"
                max={HITS_TO_DESTROY}
                value={hits}
                aria-label="Pinata hit progress"
              />
            </div>
          )}

          {phase === 'completed' && (
            <button className="button" type="button" disabled>
              <img src="/button-tomorrow.png" height="44" width="154" alt="Later"/>
            </button>
          )}
        </section>

        {phase === 'completed' && showResult && (
          <button className="button button-result" type="button" onClick={handleResultButtonClick}>
            <img className="pinata-completion-image" src="/success.png" alt="Pinata completion"/>
          </button>
        )}
      </div>
    </main>
  );
}
