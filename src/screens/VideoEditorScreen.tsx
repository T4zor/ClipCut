import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Image, Modal, Platform, PermissionsAndroid, Alert, PanResponder, TextInput, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import Video from 'react-native-video';
import { pick, types, errorCodes, isErrorWithCode } from '@react-native-documents/picker';
import { theme } from '../theme';
import AnimatedNeonButton from '../components/AnimatedNeonButton';
import { styles } from './VideoEditorScreen.styles';
import { StorageService, Clip, Keyframe, AudioClip, TextOverlay } from '../services/StorageService';
import { FFmpeg } from 'react-native-ffmpeg-lib';
import RNFS from 'react-native-fs';

const { width } = Dimensions.get('window');

const getInterpolatedProps = (clip: Clip, localTime: number) => {
  const kfs = clip.keyframes || [];
  if (kfs.length === 0) {
    return {
      scale: clip.scale ?? 1,
      opacity: clip.opacity ?? 1,
      rotation: clip.rotation ?? 0,
      x: clip.x ?? 0,
      y: clip.y ?? 0
    };
  }

  const sorted = [...kfs].sort((a, b) => a.time - b.time);

  if (localTime <= sorted[0].time) {
    return {
      scale: sorted[0].scale,
      opacity: sorted[0].opacity,
      rotation: sorted[0].rotation,
      x: sorted[0].x,
      y: sorted[0].y
    };
  }
  if (localTime >= sorted[sorted.length - 1].time) {
    return {
      scale: sorted[sorted.length - 1].scale,
      opacity: sorted[sorted.length - 1].opacity,
      rotation: sorted[sorted.length - 1].rotation,
      x: sorted[sorted.length - 1].x,
      y: sorted[sorted.length - 1].y
    };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];
    if (localTime >= k1.time && localTime <= k2.time) {
      const t = (localTime - k1.time) / (k2.time - k1.time);
      return {
        scale: k1.scale + (k2.scale - k1.scale) * t,
        opacity: k1.opacity + (k2.opacity - k1.opacity) * t,
        rotation: k1.rotation + (k2.rotation - k1.rotation) * t,
        x: k1.x + (k2.x - k1.x) * t,
        y: k1.y + (k2.y - k1.y) * t,
      };
    }
  }
  return {
    scale: clip.scale ?? 1,
    opacity: clip.opacity ?? 1,
    rotation: clip.rotation ?? 0,
    x: clip.x ?? 0,
    y: clip.y ?? 0
  };
};

interface VideoClipBlockProps {
  clip: Clip;
  index: number;
  isActive: boolean;
  showTrimHandles: boolean;
  pxPerSecond: number;
  onPress: (index: number) => void;
  openTransitionMenu: (index: number) => void;
  isLast: boolean;
  isAbsolute?: boolean;
  absoluteTop?: number;
  isMagnetEnabled: boolean;
  allClips: Clip[];
  onTrim: (index: number, newStartOffset: number, newDuration: number, newTrimStart: number) => void;
  onDrag: (index: number, newStartOffset: number, newChannel: number) => void;
  onTrimEnd: () => void;
  setIsTimelineScrollingEnabled: (val: boolean) => void;
  isDragToolActive?: boolean;
}

const VideoClipBlock = React.memo(({
  clip,
  index,
  isActive,
  showTrimHandles,
  pxPerSecond,
  onPress,
  openTransitionMenu,
  isLast,
  isAbsolute = false,
  absoluteTop,
  isMagnetEnabled,
  allClips,
  onTrim,
  onDrag,
  onTrimEnd,
  setIsTimelineScrollingEnabled,
  isDragToolActive = false
}: VideoClipBlockProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const clipWidth = (clip.duration / (clip.speed || 1.0)) * pxPerSecond;
  const numThumbs = Math.max(1, Math.floor(clipWidth / 55));
  const clipLeft = (clip.startOffset || 0) * pxPerSecond;

  const dragStartOffsetRef = useRef(0);
  const dragDurationRef = useRef(0);
  const dragTrimStartRef = useRef(0);
  const dragChannelRef = useRef(0);

  // PanResponder pour le déplacement global (Drag and Drop)
  const bodyPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isDragToolActive,
      onMoveShouldSetPanResponder: (e, gestureState) => isDragToolActive && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStartOffsetRef.current = clip.startOffset || 0;
        dragChannelRef.current = clip.channel || 0;
        setIsDragging(true);
        setIsTimelineScrollingEnabled(false);
      },
      onPanResponderMove: (e, gestureState) => {

        const deltaSeconds = gestureState.dx / pxPerSecond;
        let newStartOffset = dragStartOffsetRef.current + deltaSeconds;
        if (newStartOffset < 0) newStartOffset = 0;

        // Snapping Aimant et Anti-Superposition
        if (isMagnetEnabled) {
          if (newStartOffset < 0.3) {
            newStartOffset = 0;
          }
          const myTimelineDuration = clip.duration / (clip.speed || 1.0);
          
          // Sur la piste principale (channel 0), forcer l'alignement bout-à-bout
          const isMainTrack = dragChannelRef.current === 0;
          let bestSnap = newStartOffset;
          let minSnapDiff = 0.5; // distance max de snapping

          for (let other of allClips) {
            if (other.id === clip.id) continue;
            // Si on est sur la piste principale, on ne snap qu'avec les clips de la piste principale
            if (isMainTrack && (other.channel || 0) !== 0) continue;

            const otherStart = other.startOffset || 0;
            const otherTimelineDuration = other.duration / (other.speed || 1.0);
            const otherEnd = otherStart + otherTimelineDuration;

            // Snap au début du clip précédent (fin du nôtre contre début de l'autre)
            if (Math.abs((newStartOffset + myTimelineDuration) - otherStart) < minSnapDiff) {
              bestSnap = otherStart - myTimelineDuration;
              minSnapDiff = Math.abs((newStartOffset + myTimelineDuration) - otherStart);
            }
            // Snap à la fin du clip précédent (début du nôtre contre fin de l'autre)
            if (Math.abs(newStartOffset - otherEnd) < minSnapDiff) {
              bestSnap = otherEnd;
              minSnapDiff = Math.abs(newStartOffset - otherEnd);
            }
          }
          newStartOffset = bestSnap;
        }

        // Glissement vertical entre pistes
        const trackHeight = 78;
        const trackDelta = Math.round(-gestureState.dy / trackHeight);
        let newChannel = dragChannelRef.current + trackDelta;
        if (newChannel < 0) newChannel = 0;

        onDrag(index, newStartOffset, newChannel);
      },
      onPanResponderRelease: (e, gestureState) => {
        setIsDragging(false);
        setIsTimelineScrollingEnabled(true);
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          onPress(index);
        } else {
          onTrimEnd();
        }
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        setIsTimelineScrollingEnabled(true);
      }
    })
  ).current;

  // PanResponder pour la poignée gauche (trim start)
  const leftHandlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStartOffsetRef.current = clip.startOffset || 0;
        dragDurationRef.current = clip.duration;
        dragTrimStartRef.current = clip.trimStart || 0;
        setIsTimelineScrollingEnabled(false);
      },
      onPanResponderMove: (e, gestureState) => {
        const deltaTimelineSeconds = gestureState.dx / pxPerSecond;
        const deltaMediaSeconds = deltaTimelineSeconds * (clip.speed || 1.0);
        let newStartOffset = dragStartOffsetRef.current + deltaTimelineSeconds;
        let newDuration = dragDurationRef.current - deltaMediaSeconds;
        let newTrimStart = dragTrimStartRef.current + deltaMediaSeconds;

        if (newDuration < 0.5) {
          const diff = 0.5 - newDuration;
          newDuration = 0.5;
          newTrimStart = dragTrimStartRef.current + dragDurationRef.current - 0.5;
          newStartOffset = dragStartOffsetRef.current + (dragDurationRef.current - 0.5) / (clip.speed || 1.0);
        }
        if (newStartOffset < 0) {
          newStartOffset = 0;
          const allowedTimelineDelta = -dragStartOffsetRef.current;
          const allowedMediaDelta = allowedTimelineDelta * (clip.speed || 1.0);
          newDuration = dragDurationRef.current - allowedMediaDelta;
          newTrimStart = dragTrimStartRef.current + allowedMediaDelta;
        }
        if (newTrimStart < 0) {
          newTrimStart = 0;
          newStartOffset = dragStartOffsetRef.current - dragTrimStartRef.current / (clip.speed || 1.0);
          newDuration = dragDurationRef.current + dragTrimStartRef.current;
        }

        onTrim(index, newStartOffset, newDuration, newTrimStart);
      },
      onPanResponderRelease: () => {
        setIsTimelineScrollingEnabled(true);
        onTrimEnd();
      },
      onPanResponderTerminate: () => {
        setIsTimelineScrollingEnabled(true);
      }
    })
  ).current;

  // PanResponder pour la poignée droite (trim end / extend)
  const rightHandlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragDurationRef.current = clip.duration;
        setIsTimelineScrollingEnabled(false);
      },
      onPanResponderMove: (e, gestureState) => {
        const deltaTimelineSeconds = gestureState.dx / pxPerSecond;
        const deltaMediaSeconds = deltaTimelineSeconds * (clip.speed || 1.0);
        let newDuration = dragDurationRef.current + deltaMediaSeconds;

        const maxDuration = clip.type === 'video'
          ? (clip.originalDuration || clip.duration) - (clip.trimStart || 0)
          : 9999;

        if (newDuration < 0.5) newDuration = 0.5;
        if (newDuration > maxDuration) newDuration = maxDuration;

        onTrim(index, clip.startOffset || 0, newDuration, clip.trimStart || 0);
      },
      onPanResponderRelease: () => {
        setIsTimelineScrollingEnabled(true);
        onTrimEnd();
      },
      onPanResponderTerminate: () => {
        setIsTimelineScrollingEnabled(true);
      }
    })
  ).current;

  return (
    <React.Fragment>
      <View
        {...bodyPanResponder.panHandlers}
        style={[
          styles.clipBlock,
          { width: clipWidth },
          isAbsolute && { position: 'absolute', left: clipLeft, top: absoluteTop },
          isActive && styles.selectedClipBlock,
          isDragging && {
            opacity: 0.8,
            transform: [{ scale: 1.04 }],
            zIndex: 999,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
          }
        ]}
      >
        <View style={styles.clipFilmStrip} pointerEvents="none">
          {clip.type === 'image' ? (
            Array.from({ length: numThumbs }).map((_, thumbIdx) => (
              <Image key={thumbIdx} source={{ uri: clip.uri }} style={styles.clipFilmThumbnail} resizeMode="cover" />
            ))
          ) : (
            <Video
              source={{ uri: clip.uri }}
              paused={true}
              muted={true}
              volume={0}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          )}
        </View>
        <Text style={styles.clipBlockLabel} numberOfLines={1}>
          {clip.fileName}
        </Text>
        {clip.keyframes && clip.keyframes.length > 0 && (
          <View style={styles.keyframeDotContainer}>
            {clip.keyframes.map((kf, kfIdx) => (
              <Text key={kfIdx} style={styles.timelineKeyframeDiamond}>◊</Text>
            ))}
          </View>
        )}

        {/* Poignée Gauche (Trim) */}
        {showTrimHandles && (
          <View
            {...leftHandlePanResponder.panHandlers}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 14,
              backgroundColor: theme.colors.primary,
              justifyContent: 'center',
              alignItems: 'center',
              borderTopLeftRadius: 4,
              borderBottomLeftRadius: 4,
              zIndex: 99,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' }}>|</Text>
          </View>
        )}

        {/* Poignée Droite (Trim) */}
        {showTrimHandles && (
          <View
            {...rightHandlePanResponder.panHandlers}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 14,
              backgroundColor: theme.colors.primary,
              justifyContent: 'center',
              alignItems: 'center',
              borderTopRightRadius: 4,
              borderBottomRightRadius: 4,
              zIndex: 99,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' }}>|</Text>
          </View>
        )}
      </View>

      {!isLast && (
        <TouchableOpacity
          style={[
            styles.transitionIndicator,
            isAbsolute && { position: 'absolute', left: clipLeft + clipWidth - 12, top: 23, zIndex: 10 },
            clip.transition !== 'none' && styles.activeTransitionIndicator
          ]}
          onPress={() => openTransitionMenu(index)}
        >
          <Text style={styles.transitionIndicatorText}>
            {clip.transition === 'none' ? '⧛⧚' : '⚡'}
          </Text>
        </TouchableOpacity>
      )}
    </React.Fragment>
  );
});

interface AudioClipBlockProps {
  audio: AudioClip;
  index: number;
  isActive: boolean;
  onPress: (index: number) => void;
  onDrag: (index: number, newStartOffset: number) => void;
  onTrim: (index: number, newStartOffset: number, newDuration: number, newTrimStart: number) => void;
  onTrimEnd: () => void;
  pxPerSecond: number;
  setIsTimelineScrollingEnabled: (val: boolean) => void;
  isDragToolActive?: boolean;
}

const AudioClipBlockComponent = React.memo(({
  audio,
  index,
  isActive,
  onPress,
  onDrag,
  onTrim,
  onTrimEnd,
  pxPerSecond,
  setIsTimelineScrollingEnabled,
  isDragToolActive = false
}: AudioClipBlockProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartOffsetRef = useRef(0);
  const dragDurationRef = useRef(0);
  const dragTrimStartRef = useRef(0);

  const speed = audio.speed || 1.0;
  const audioLeft = audio.startOffset * pxPerSecond;
  const audioWidth = (audio.duration / speed) * pxPerSecond;

  // PanResponder pour le déplacement global (Drag and Drop)
  const bodyPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isDragToolActive,
      onMoveShouldSetPanResponder: (e, gestureState) => isDragToolActive && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStartOffsetRef.current = audio.startOffset;
        setIsDragging(true);
        setIsTimelineScrollingEnabled(false);
      },
      onPanResponderMove: (e, gestureState) => {

        const deltaSeconds = gestureState.dx / pxPerSecond;
        let newStartOffset = dragStartOffsetRef.current + deltaSeconds;
        if (newStartOffset < 0) newStartOffset = 0;

        onDrag(index, newStartOffset);
      },
      onPanResponderRelease: (e, gestureState) => {
        setIsDragging(false);
        setIsTimelineScrollingEnabled(true);
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          onPress(index);
        } else {
          onTrimEnd();
        }
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        setIsTimelineScrollingEnabled(true);
      }
    })
  ).current;

  // PanResponder pour la poignée gauche (trim start)
  const leftHandlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStartOffsetRef.current = audio.startOffset;
        dragDurationRef.current = audio.duration;
        dragTrimStartRef.current = audio.trimStart || 0;
        setIsTimelineScrollingEnabled(false);
      },
      onPanResponderMove: (e, gestureState) => {
        const deltaTimelineSeconds = gestureState.dx / pxPerSecond;
        const deltaMediaSeconds = deltaTimelineSeconds * speed;
        let newStartOffset = dragStartOffsetRef.current + deltaTimelineSeconds;
        let newDuration = dragDurationRef.current - deltaMediaSeconds;
        let newTrimStart = dragTrimStartRef.current + deltaMediaSeconds;

        if (newDuration < 0.5) {
          newDuration = 0.5;
          newTrimStart = dragTrimStartRef.current + dragDurationRef.current - 0.5;
          newStartOffset = dragStartOffsetRef.current + (dragDurationRef.current - 0.5) / speed;
        }
        if (newStartOffset < 0) {
          newStartOffset = 0;
          const allowedTimelineDelta = -dragStartOffsetRef.current;
          const allowedMediaDelta = allowedTimelineDelta * speed;
          newDuration = dragDurationRef.current - allowedMediaDelta;
          newTrimStart = dragTrimStartRef.current + allowedMediaDelta;
        }
        if (newTrimStart < 0) {
          newTrimStart = 0;
          newStartOffset = dragStartOffsetRef.current - dragTrimStartRef.current / speed;
          newDuration = dragDurationRef.current + dragTrimStartRef.current;
        }

        onTrim(index, newStartOffset, newDuration, newTrimStart);
      },
      onPanResponderRelease: () => {
        onTrimEnd();
      }
    })
  ).current;

  // PanResponder pour la poignée droite (trim end / extend)
  const rightHandlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragDurationRef.current = audio.duration;
        setIsTimelineScrollingEnabled(false);
      },
      onPanResponderMove: (e, gestureState) => {
        const deltaTimelineSeconds = gestureState.dx / pxPerSecond;
        const deltaMediaSeconds = deltaTimelineSeconds * speed;
        let newDuration = dragDurationRef.current + deltaMediaSeconds;

        const maxDuration = (audio.originalDuration || audio.duration) - (audio.trimStart || 0);
        if (newDuration < 0.5) newDuration = 0.5;
        if (newDuration > maxDuration) newDuration = maxDuration;

        onTrim(index, audio.startOffset, newDuration, audio.trimStart || 0);
      },
      onPanResponderRelease: () => {
        onTrimEnd();
      }
    })
  ).current;

  return (
    <View
      {...bodyPanResponder.panHandlers}
      style={[
        styles.audioClipBlock,
        { left: audioLeft, width: audioWidth },
        isActive && { borderColor: '#FFFFFF', borderWidth: 1.5, height: 36, top: -2 },
        isDragging && { opacity: 0.8 }
      ]}
    >
      <Text style={styles.audioClipText} numberOfLines={1}>
        🎵 {audio.name}
      </Text>
      <View style={styles.waveformContainer}>
        {Array.from({ length: Math.max(1, Math.floor(audioWidth / 8)) }).map((_, waveIdx) => {
          const barHeight = Math.max(4, Math.sin(waveIdx * 0.5) * 12 + 10);
          return (
            <View
              key={waveIdx}
              style={[
                styles.waveformBar,
                { height: barHeight }
              ]}
            />
          );
        })}
      </View>

      {/* Poignée Gauche (Trim) */}
      {isActive && (
        <View
          {...leftHandlePanResponder.panHandlers}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 10,
            backgroundColor: '#047857',
            justifyContent: 'center',
            alignItems: 'center',
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
            zIndex: 99,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: 'bold' }}>|</Text>
        </View>
      )}

      {/* Poignée Droite (Trim) */}
      {isActive && (
        <View
          {...rightHandlePanResponder.panHandlers}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 10,
            backgroundColor: '#047857',
            justifyContent: 'center',
            alignItems: 'center',
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
            zIndex: 99,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: 'bold' }}>|</Text>
        </View>
      )}
    </View>
  );
});

interface VideoPlayerProps {
  uri: string;
  localTime: number;
  isPlaying: boolean;
  style: any;
  speed?: number;
  onLoad?: (ratio: number) => void;
}
const VideoPlayer = ({ uri, localTime, isPlaying, style, speed = 1, onLoad, isActive = true }: VideoPlayerProps & { isActive?: boolean }) => {
  const videoRef = useRef<any>(null);
  const seekTimeout = useRef<any>(null);

  useEffect(() => {
    if (!isPlaying && videoRef.current) {
      if (seekTimeout.current) clearTimeout(seekTimeout.current);
      seekTimeout.current = setTimeout(() => {
        if (videoRef.current) videoRef.current.seek(localTime);
      }, 150); // Throttle à 150ms pour éviter de saturer ExoPlayer
    }
    return () => { if (seekTimeout.current) clearTimeout(seekTimeout.current); };
  }, [localTime, isPlaying]);

  return (
    <Video
      ref={videoRef}
      source={{ uri }}
      style={style}
      resizeMode="contain"
      paused={!isPlaying || !isActive}
      rate={speed}
      muted={!isActive}
      volume={1.0}
      useTextureView={true} // Obligatoire sur Android pour que les transforms (rotation, opacity) affectent la vidéo
      playInBackground={false}
      playWhenInactive={false}
      onLoad={(data) => {
        if (data && data.naturalSize) {
          const { width, height, orientation } = data.naturalSize;
          let ratio = width / height;
          const orient: any = orientation;
          const isPortraitStr = typeof orient === 'string' && (orient === 'portrait' || orient === 'portrait-upside-down');
          const isLandscapeStr = typeof orient === 'string' && (orient === 'landscape' || orient === 'landscape-left' || orient === 'landscape-right');
          const isPortraitNum = typeof orient === 'number' && (orient === 90 || orient === 270);
          const isLandscapeNum = typeof orient === 'number' && (orient === 0 || orient === 180);

          // Si la vidéo est en portrait (90 ou 270 deg) mais que width > height, on inverse
          if ((isPortraitStr || isPortraitNum) && width > height) {
            ratio = height / width;
          } else if ((isLandscapeStr || isLandscapeNum) && width < height) {
            ratio = height / width;
          }
          if (ratio && !isNaN(ratio)) {
            onLoad && onLoad(ratio);
          }
        }
      }}
    />
  );
};

interface BackgroundAudioPlayerProps {
  uri: string;
  startOffset: number;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
}

const BackgroundAudioPlayer = ({ uri, startOffset, duration, currentTime, isPlaying }: BackgroundAudioPlayerProps) => {
  const audioRef = useRef<any>(null);
  const seekTimeout = useRef<any>(null);

  const isActive = currentTime >= startOffset && currentTime <= startOffset + duration;
  const isBuffered = currentTime >= startOffset - 2 && currentTime <= startOffset + duration + 2;
  const audioLocalTime = Math.max(0, currentTime - startOffset);

  useEffect(() => {
    if (!isPlaying && audioRef.current) {
      if (seekTimeout.current) clearTimeout(seekTimeout.current);
      seekTimeout.current = setTimeout(() => {
        if (audioRef.current) audioRef.current.seek(audioLocalTime);
      }, 150);
    }
    return () => { if (seekTimeout.current) clearTimeout(seekTimeout.current); };
  }, [audioLocalTime, isPlaying]);

  // Si le clip est hors buffer (plus de 2 sec loin), on le détruit pour économiser la RAM
  if (!isBuffered) return null;

  return (
    <Video
      ref={audioRef}
      source={{ uri }}
      paused={!isPlaying || !isActive}
      muted={!isActive}
      volume={1.0}
      playInBackground={true}
      playWhenInactive={true}
      ignoreSilentSwitch="ignore"
      // @ts-ignore
      audioOnly={true}
      style={{ width: 0, height: 0, position: 'absolute' }}
    />
  );
};

interface CustomSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  formatValue?: (val: number) => string;
}

const CustomSlider = ({ value, min, max, onChange, formatValue, setIsDragging }: CustomSliderProps & { setIsDragging?: (val: boolean) => void }) => {
  const [width, setWidth] = useState(250);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (setIsDragging) setIsDragging(true);
        const touchX = e.nativeEvent.locationX;
        const percentage = Math.max(0, Math.min(1, touchX / width));
        onChange(min + percentage * (max - min));
      },
      onPanResponderMove: (e, gestureState) => {
        // En move, locationX n'est pas fiable, on utilise dx par rapport à la taille
        // Alternative plus simple : on calcule via moveX par rapport à la position de l'écran.
        // Mais plus robuste: récupérer pageX du composant. 
        // Simplification: React Native slider.
        // Dans onPanResponderMove, on utilise locationX depuis la racine si disponible, mais e.nativeEvent.locationX est parfois pété.
        // On va juste mettre à jour le state.
      },
      onPanResponderRelease: () => {
        if (setIsDragging) setIsDragging(false);
      },
      onPanResponderTerminate: () => {
        if (setIsDragging) setIsDragging(false);
      }
    })
  ).current;

  // Remplacement du PanResponder complexe par de simples événements de touch avec suppression du scroll parent
  const handleTouch = (e: any) => {
    const touchX = e.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, touchX / width));
    const newValue = min + percentage * (max - min);
    onChange(newValue);
  };

  const fillPercent = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <View
      style={{ flex: 1, height: 40, justifyContent: 'center', marginHorizontal: 10 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width || 250)}
      onTouchStart={(e) => {
        if (setIsDragging) setIsDragging(true);
        handleTouch(e);
      }}
      onTouchMove={handleTouch}
      onTouchEnd={() => setIsDragging && setIsDragging(false)}
      onTouchCancel={() => setIsDragging && setIsDragging(false)}
    >
      <View style={{ height: 6, backgroundColor: '#2B2B3E', borderRadius: 3, position: 'relative' }}>
        <View style={{ height: '100%', width: `${fillPercent}%`, backgroundColor: theme.colors.primary, borderRadius: 3 }} />
        <View
          style={{
            position: 'absolute',
            left: `${fillPercent}%`,
            top: -5,
            marginLeft: -8,
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: '#FFFFFF',
            borderWidth: 2,
            borderColor: theme.colors.primary,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.3,
            shadowRadius: 1.5,
            elevation: 3,
          }}
        />
      </View>
    </View>
  );
};

const VideoEditorScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { projectId } = route.params || {};

  // États du projet
  const [projectName, setProjectName] = useState('Chargement...');
  const [projectFormat, setProjectFormat] = useState('9:16');
  const [clips, setClips] = useState<Clip[]>([]);
  const [mediaAspectRatios, setMediaAspectRatios] = useState<{ [clipId: string]: number }>({});
  const handleMediaLoad = React.useCallback((clipId: string, ratio: number) => {
    setMediaAspectRatios(prev => {
      if (prev[clipId] === ratio) return prev;
      return { ...prev, [clipId]: ratio };
    });
  }, []);
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const [isTimelineScrollingEnabled, setIsTimelineScrollingEnabled] = useState(true);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | null>(null);
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState<number | null>(null);

  // Historique Undo / Redo
  const [historyVersion, setHistoryVersion] = useState(0);
  const historyRef = React.useRef<{ clips: Clip[]; audioClips: AudioClip[] }[]>([]);
  const historyIndexRef = React.useRef(-1);

  const saveHistoryState = React.useCallback((newClips: Clip[], newAudio: AudioClip[]) => {
    const clonedClips = JSON.parse(JSON.stringify(newClips));
    const clonedAudio = JSON.parse(JSON.stringify(newAudio));

    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push({ clips: clonedClips, audioClips: clonedAudio });

    if (nextHistory.length > 50) {
      nextHistory.shift();
    }

    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistoryVersion(prev => prev + 1);
  }, []);

  const handleUndo = React.useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const state = historyRef.current[historyIndexRef.current];
      setClips(JSON.parse(JSON.stringify(state.clips)));
      setAudioClips(JSON.parse(JSON.stringify(state.audioClips)));
      setSelectedClipIndex(null);
      setHistoryVersion(prev => prev + 1);
    }
  }, []);

  const handleRedo = React.useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const state = historyRef.current[historyIndexRef.current];
      setClips(JSON.parse(JSON.stringify(state.clips)));
      setAudioClips(JSON.parse(JSON.stringify(state.audioClips)));
      setSelectedClipIndex(null);
      setHistoryVersion(prev => prev + 1);
    }
  }, []);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timelineRef = React.useRef<ScrollView>(null);

  // États de l'UI
  const [currentPanel, setCurrentPanel] = useState<'main' | 'edit' | 'transition' | 'ratio' | 'text' | 'properties'>('main');
  const [zoomLevel, setZoomLevel] = useState(1.0); // Échelle Zoom (1x à 4x)
  const [isMagnetEnabled, setIsMagnetEnabled] = useState(true);
  const [isDragToolActive, setIsDragToolActive] = useState(false); // Outil de déplacement exclusif

  // États pour Texte
  const [isTextModalVisible, setIsTextModalVisible] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null);
  const [isSliderDragging, setIsSliderDragging] = useState(false);

  // États pour Audio
  const [isAudioModalVisible, setIsAudioModalVisible] = useState(false);
  const [customAudioName, setCustomAudioName] = useState('');

  // États pour Export
  const [isExportSettingsVisible, setIsExportSettingsVisible] = useState(false);
  const [isExportPreviewVisible, setIsExportPreviewVisible] = useState(false);
  const [exportPreviewPath, setExportPreviewPath] = useState<string | null>(null);
  const [exportName, setExportName] = useState(projectName);
  const [exportResolution, setExportResolution] = useState('1080p');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const handleTrim = (index: number, newStartOffset: number, newDuration: number, newTrimStart: number) => {
    setClips(prev => {
      return prev.map((c, i) => {
        if (i === index) {
          return { ...c, startOffset: newStartOffset, duration: newDuration, trimStart: newTrimStart };
        }
        return c;
      });
    });
  };

  const handleDrag = (index: number, newStartOffset: number, newChannel: number) => {
    setClips(prev => {
      return prev.map((c, i) => {
        if (i === index) {
          return { ...c, startOffset: newStartOffset, channel: newChannel };
        }
        return c;
      });
    });
  };

  const forceSequentialMainTrack = (clipsArray: Clip[]) => {
    if (!isMagnetEnabled) return clipsArray;
    const newClips = [...clipsArray].map(c => ({...c}));
    const mainClips = newClips.filter(c => (c.channel || 0) === 0);
    const otherClips = newClips.filter(c => (c.channel || 0) !== 0);

    mainClips.sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0));

    let currentOffset = 0;
    for (let i = 0; i < mainClips.length; i++) {
      mainClips[i].startOffset = currentOffset;
      currentOffset += (mainClips[i].duration / (mainClips[i].speed || 1.0));
    }

    return [...mainClips, ...otherClips];
  };

  const handleTrimEnd = () => {
    setClips(prev => {
      const magneticClips = forceSequentialMainTrack(prev);
      saveHistoryState(magneticClips, audioClips);
      if (projectId) {
        StorageService.saveProject({
          id: projectId,
          name: projectName,
          format: projectFormat,
          clips: magneticClips,
          audioClips: audioClips,
          lastModified: Date.now()
        });
      }
      return magneticClips;
    });
  };

  const handleClipPress = (index: number) => {
    setSelectedAudioIndex(null);
    setSelectedTextIndex(null);
    setSelectedClipIndex(index);
  };

  const handleAudioPress = (index: number) => {
    setSelectedAudioIndex(index);
    setSelectedClipIndex(null);
  };

  const handleAudioDrag = (index: number, newStartOffset: number) => {
    setAudioClips(prev => {
      return prev.map((a, i) => {
        if (i === index) {
          return { ...a, startOffset: newStartOffset };
        }
        return a;
      });
    });
  };

  const handleAudioTrim = (index: number, newStartOffset: number, newDuration: number, newTrimStart: number) => {
    setAudioClips(prev => {
      return prev.map((a, i) => {
        if (i === index) {
          return { ...a, startOffset: newStartOffset, duration: newDuration, trimStart: newTrimStart };
        }
        return a;
      });
    });
  };

  const handleAudioTrimEnd = () => {
    saveHistoryState(clips, audioClips);
    if (projectId) {
      StorageService.saveProject({
        id: projectId,
        name: projectName,
        format: projectFormat,
        clips: clips,
        audioClips: audioClips,
        lastModified: Date.now()
      });
    }
  };

  // Calcul du facteur px/sec de la timeline
  const pxPerSecond = 16 * zoomLevel;

  // Initialisation du projet
  React.useEffect(() => {
    if (projectId) {
      StorageService.getProjectById(projectId).then(proj => {
        if (proj) {
          setProjectName(proj.name);
          setProjectFormat(proj.format);
          const initialClips = proj.clips || [];
          const initialAudio = proj.audioClips || [];
          
          let finalClips = initialClips;
          if (isMagnetEnabled) {
            finalClips = forceSequentialMainTrack(initialClips);
          }
          
          setClips(finalClips);
          setAudioClips(initialAudio);

          // Initialiser l'historique
          historyRef.current = [{
            clips: JSON.parse(JSON.stringify(finalClips)),
            audioClips: JSON.parse(JSON.stringify(initialAudio))
          }];
          historyIndexRef.current = 0;
        }
      });
    }
  }, [projectId]);

  // Sauvegarde Automatique
  React.useEffect(() => {
    if (projectId && projectName !== 'Chargement...') {
      StorageService.saveProject({
        id: projectId,
        name: projectName,
        format: projectFormat,
        clips: clips,
        audioClips: audioClips,
        lastModified: Date.now()
      });
    }
  }, [clips, projectFormat, projectName, audioClips]);

  // Moteur de lecture (Timer)
  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          const totalVideo = clips.reduce((acc, c) => Math.max(acc, (c.startOffset || 0) + c.duration / (c.speed || 1.0)), 0);
          const totalAudio = audioClips.reduce((acc, a) => Math.max(acc, a.startOffset + a.duration), 0);
          const total = Math.max(totalVideo, totalAudio, 10);
          if (prev >= total) {
            return total;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, clips, audioClips]);

  // Surveiller la fin de la lecture pour arrêter le timer
  React.useEffect(() => {
    if (isPlaying) {
      const totalVideo = clips.reduce((acc, c) => Math.max(acc, (c.startOffset || 0) + c.duration / (c.speed || 1.0)), 0);
      const totalAudio = audioClips.reduce((acc, a) => Math.max(acc, a.startOffset + a.duration), 0);
      const total = Math.max(totalVideo, totalAudio, 10);
      if (currentTime >= total) {
        setIsPlaying(false);
      }
    }
  }, [currentTime, isPlaying, clips, audioClips]);

  // Synchronisation ScrollView avec la lecture
  React.useEffect(() => {
    if (isPlaying && timelineRef.current) {
      timelineRef.current.scrollTo({ x: currentTime * pxPerSecond, animated: false });
    }
  }, [currentTime, isPlaying, pxPerSecond]);

  // Défilement manuel (Scrubbing)
  const handleScroll = (event: any) => {
    if (!isPlaying) {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newTime = Math.max(0, offsetX / pxPerSecond);
      setCurrentTime(newTime);
    }
  };

  // Suivi dynamique du clip actif
  React.useEffect(() => {
    if (clips.length > 0) {
      if (selectedClipIndex === null || selectedClipIndex >= clips.length) {
        const activeClips = clips.filter(c => {
          const start = c.startOffset || 0;
          const speed = c.speed || 1;
          const end = start + c.duration / speed;
          return currentTime >= start && currentTime <= end;
        });
        const preview = activeClips.sort((a, b) => (b.channel || 0) - (a.channel || 0))[0] || clips[0] || null;
        const previewIdx = preview ? clips.indexOf(preview) : 0;
        setSelectedClipIndex(previewIdx);
      }
    } else {
      setSelectedClipIndex(null);
    }
  }, [currentTime, clips, selectedClipIndex]);

  // Demander les permissions de médias sur Android
  const requestMediaPermission = async () => {
    if (Platform.OS !== 'android') return true;

    try {
      // Pour Android 13+ (API 33+)
      if (Number(Platform.Version) >= 33) {
        const grantedImages = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        );
        const grantedVideo = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO
        );
        return (
          grantedImages === PermissionsAndroid.RESULTS.GRANTED &&
          grantedVideo === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        // Pour Android 12 et inférieur
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn(err);
      return false;
    }
  };

  // Gérer l'importation de médias
  const handleAddClips = async () => {
    const hasPermission = await requestMediaPermission();
    if (!hasPermission) {
      Alert.alert(
        "Permission requise",
        "Permission d'accéder aux médias refusée. Veuillez l'activer dans les paramètres."
      );
      return;
    }

    try {
      const result = await launchImageLibrary({
        mediaType: 'mixed',
        selectionLimit: 0, // Illimité
      });

      if (result.assets && result.assets.length > 0) {
        // Insérer les nouveaux médias à la position courante de la tête de lecture (currentTime)
        let currentOffset = currentTime;

        // Logique d'insertion aimantée
        if (isMagnetEnabled) {
          // Si on est aimanté, on pousse juste le nouveau clip à sa position temporelle.
          // La fonction forceSequential s'assurera qu'il pousse les autres au lieu de se superposer.
          // On n'a pas besoin de faire Math.abs(currentOffset - cEnd) < 1.0
        }

        const newClips: Clip[] = [];
        let runningOffset = currentOffset;

        result.assets.forEach(asset => {
          const isVideo = asset.type?.startsWith('video') || false;
          const mediaDuration = isVideo && asset.duration ? asset.duration : 5;

          newClips.push({
            id: Date.now().toString() + '-' + Math.random().toString(),
            uri: asset.uri || '',
            type: isVideo ? 'video' : 'image',
            fileName: asset.fileName || 'Média',
            transition: 'none',
            duration: mediaDuration,
            originalDuration: mediaDuration,
            trimStart: 0,
            textOverlays: [],
            channel: 0,
            startOffset: runningOffset,
            speed: 1.0,
            scale: 1,
            rotation: 0,
            x: 0,
            y: 0,
            opacity: 1
          });
          runningOffset += mediaDuration;
        });

        setClips(prev => {
          let nextClips = [...prev, ...newClips];
          if (isMagnetEnabled) {
            nextClips = forceSequentialMainTrack(nextClips);
          }
          saveHistoryState(nextClips, audioClips);
          return nextClips;
        });
        if (selectedClipIndex === null) {
          setSelectedClipIndex(clips.length);
        }
      }
    } catch (error) {
      console.log('Erreur de sélection de médias:', error);
    }
  };

  // Couper / Split le clip sélectionné
  const handleSplitClip = () => {
    if (selectedClipIndex !== null && clips[selectedClipIndex]) {
      const clipToSplit = clips[selectedClipIndex];
      const start = clipToSplit.startOffset || 0;
      const clipLocal = currentTime - start;

      // Valider que la playhead est bien à l'intérieur du clip
      if (clipLocal <= 0.2 || clipLocal >= clipToSplit.duration - 0.2) {
        Alert.alert(
          "Découpe impossible",
          "Placez la playhead (barre blanche verticale au centre) au milieu du clip pour pouvoir le couper."
        );
        return;
      }

      const newClip1: Clip = {
        ...clipToSplit,
        id: Date.now().toString() + '-part1-' + Math.random().toString(),
        fileName: `${clipToSplit.fileName} (Partie 1)`,
        duration: clipLocal,
        keyframes: clipToSplit.keyframes?.filter(k => k.time < clipLocal) || []
      };

      const newClip2: Clip = {
        ...clipToSplit,
        id: Date.now().toString() + '-part2-' + Math.random().toString(),
        fileName: `${clipToSplit.fileName} (Partie 2)`,
        duration: clipToSplit.duration - clipLocal,
        startOffset: start + clipLocal,
        trimStart: (clipToSplit.trimStart || 0) + clipLocal * (clipToSplit.speed || 1),
        keyframes: clipToSplit.keyframes?.filter(k => k.time >= clipLocal).map(k => ({
          ...k,
          time: k.time - clipLocal
        })) || []
      };

      let updatedClips = [...clips];
      updatedClips.splice(selectedClipIndex, 1, newClip1, newClip2);
      if (isMagnetEnabled) {
        updatedClips = forceSequentialMainTrack(updatedClips);
      }

      setClips(updatedClips);
      saveHistoryState(updatedClips, audioClips);
      setSelectedClipIndex(selectedClipIndex); // Garde le focus sur la première partie
    }
  };

  // Supprimer le clip sélectionné ou l'audio sélectionné
  const handleDeleteClip = () => {
    if (selectedClipIndex !== null) {
      let updatedClips = clips.filter((_, i) => i !== selectedClipIndex);
      if (isMagnetEnabled) {
        updatedClips = forceSequentialMainTrack(updatedClips);
      }
      setClips(updatedClips);
      saveHistoryState(updatedClips, audioClips);
      setSelectedClipIndex(null);
    } else if (selectedAudioIndex !== null) {
      const updatedAudio = audioClips.filter((_, i) => i !== selectedAudioIndex);
      setAudioClips(updatedAudio);
      saveHistoryState(clips, updatedAudio);
      setSelectedAudioIndex(updatedAudio.length > 0 ? 0 : null);
    }
  };

  // Ouvrir le tiroir de transition pour un interstice spécifique
  const openTransitionMenu = (index: number) => {
    setSelectedTransitionIndex(index);
    setCurrentPanel('transition');
  };

  const selectTransition = (transitionType: string) => {
    if (selectedTransitionIndex !== null) {
      const updatedClips = [...clips];
      updatedClips[selectedTransitionIndex].transition = transitionType;
      setClips(updatedClips);
      saveHistoryState(updatedClips, audioClips);
      setCurrentPanel('main');
      setSelectedTransitionIndex(null);
    }
  };

  // Calcul du temps total (maximum entre vidéo et audio)
  const totalVideoDuration = clips.reduce((acc, c) => Math.max(acc, (c.startOffset || 0) + c.duration / (c.speed || 1.0)), 0);
  const totalAudioDuration = audioClips.reduce((acc, a) => Math.max(acc, a.startOffset + a.duration), 0);
  const totalDuration = Math.max(totalVideoDuration, totalAudioDuration, 10);

  // Formatage du temps
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `00:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Trouver tous les clips actifs sous la playhead
  const activeClipsAtTime = clips.filter(c => {
    const start = c.startOffset || 0;
    const speed = c.speed || 1;
    const end = start + c.duration / speed;
    return currentTime >= start && currentTime <= end;
  });

  // Trouver les clips qui sont proches de la playhead (préchargement / buffer de 2 secondes)
  const bufferedClipsAtTime = clips.filter(c => {
    const start = c.startOffset || 0;
    const speed = c.speed || 1;
    const end = start + c.duration / speed;
    return currentTime >= start - 2 && currentTime <= end + 2;
  });

  // Le clip d'aperçu principal (canal le plus élevé)
  const previewClip = activeClipsAtTime.sort((a, b) => (b.channel || 0) - (a.channel || 0))[0] || clips[0] || null;
  const previewClipIndex = previewClip ? clips.indexOf(previewClip) : 0;

  // Clip en cours d'édition (sélectionné, ou par défaut celui sous la playhead)
  const activeClipIndex = selectedClipIndex !== null ? selectedClipIndex : previewClipIndex;
  const activeClip = clips[activeClipIndex] || null;

  const clipStartOffset = activeClip ? (activeClip.startOffset || 0) : 0;
  const clipLocalTime = activeClip ? Math.max(0, currentTime - clipStartOffset) * (activeClip.speed || 1) : 0;

  // Propriétés physiques interpolées pour l'aperçu du clip actif
  const activeProps = activeClip
    ? getInterpolatedProps(activeClip, clipLocalTime)
    : { scale: 1, opacity: 1, rotation: 0, x: 0, y: 0 };

  const dragStartXRef = React.useRef(0);
  const dragStartYRef = React.useRef(0);

  // PanResponder pour déplacer le texte ou le média au doigt
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isDragToolActive,
      onPanResponderGrant: () => {
        if (activeClipIndex !== null && clips[activeClipIndex]) {
          const clip = clips[activeClipIndex];
          if (selectedTextIndex !== null && clip.textOverlays[selectedTextIndex]) {
            dragStartXRef.current = clip.textOverlays[selectedTextIndex].x || 0;
            dragStartYRef.current = clip.textOverlays[selectedTextIndex].y || 0;
          } else {
            dragStartXRef.current = clip.x || 0;
            dragStartYRef.current = clip.y || 0;
          }
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        setClips(prevClips => {
          if (activeClipIndex === null || !prevClips[activeClipIndex]) return prevClips;
          const updated = [...prevClips];
          const clip = updated[activeClipIndex];

          if (selectedTextIndex !== null && clip.textOverlays[selectedTextIndex]) {
            const txt = { ...clip.textOverlays[selectedTextIndex] };
            txt.x = dragStartXRef.current + gestureState.dx;
            txt.y = dragStartYRef.current + gestureState.dy;
            clip.textOverlays[selectedTextIndex] = txt;
          } else {
            clip.x = dragStartXRef.current + gestureState.dx;
            clip.y = dragStartYRef.current + gestureState.dy;
          }
          return updated;
        });
      },
    })
  ).current;

  // Keyframes Helpers
  const toggleKeyframe = () => {
    if (activeClipIndex === null || !activeClip) return;
    const updatedClips = [...clips];
    const clip = updatedClips[activeClipIndex];
    if (!clip.keyframes) clip.keyframes = [];

    const existingIdx = clip.keyframes.findIndex(kf => Math.abs(kf.time - clipLocalTime) < 0.15);
    if (existingIdx >= 0) {
      clip.keyframes.splice(existingIdx, 1);
    } else {
      clip.keyframes.push({
        time: clipLocalTime,
        scale: clip.scale ?? 1,
        opacity: clip.opacity ?? 1,
        rotation: clip.rotation ?? 0,
        x: clip.x ?? 0,
        y: clip.y ?? 0
      });
    }
    setClips(updatedClips);
  };

  const hasKeyframeAtCurrentTime = activeClip?.keyframes?.some(kf => Math.abs(kf.time - clipLocalTime) < 0.15) || false;

  // Ajouter du texte
  const handleAddText = () => {
    if (activeClipIndex === null || clips.length === 0) {
      Alert.alert("Sélection requise", "Veuillez importer un média avant d'ajouter du texte.");
      return;
    }
    setCurrentText('');
    setIsTextModalVisible(true);
  };

  const saveText = () => {
    if (activeClipIndex !== null && currentText.trim()) {
      const updatedClips = [...clips];
      const clip = updatedClips[activeClipIndex];
      const newOverlay: TextOverlay = {
        id: Date.now().toString(),
        text: currentText.trim(),
        color: '#FFFFFF',
        x: 0,
        y: 0
      };
      clip.textOverlays = [...(clip.textOverlays || []), newOverlay];
      setClips(updatedClips);
      setSelectedTextIndex(clip.textOverlays.length - 1);
    }
    setIsTextModalVisible(false);
  };

  // Audio Handler
  const handleAddAudio = (songName: string, customUri?: string, customDuration?: number) => {
    let uri = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
    let duration = 180; // 3 min par défaut
    if (songName === 'Summer Vibe Upbeat') {
      uri = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3';
      duration = 210;
    } else if (songName === 'Chill acoustic Guitar') {
      uri = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3';
      duration = 150;
    } else if (songName === 'Cyberpunk Synthwave') {
      uri = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3';
      duration = 240;
    } else if (customUri) {
      uri = customUri;
      duration = customDuration || 120;
    }

    const newAudio: AudioClip = {
      id: Date.now().toString() + '-' + Math.random().toString(),
      name: songName,
      uri: uri,
      duration: duration,
      originalDuration: duration,
      trimStart: 0,
      startOffset: currentTime
    };
    const nextAudio = [...audioClips, newAudio];
    setAudioClips(nextAudio);
    saveHistoryState(clips, nextAudio);
    setIsAudioModalVisible(false);
  };

  const handlePickLocalAudio = async () => {
    try {
      const res = await pick({
        type: [types.audio],
      });
      if (res && res.length > 0) {
        const file = res[0];
        // Extraire un nom de fichier propre
        const fileName = file.name || 'Audio importé';
        handleAddAudio(fileName, file.uri, 180);
      }
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        console.log("Sélection audio annulée");
      } else {
        console.log("Erreur lors de la sélection du fichier audio :", err);
        Alert.alert("Erreur", "Impossible de lire ce fichier audio.");
      }
    }
  };

  // Lancement de l'Exportation
  const openExportSettings = () => {
    setExportName(projectName);
    setIsExportSettingsVisible(true);
  };

  const startExport = async () => {
    setIsExportSettingsVisible(false);
    setIsExporting(true);
    // On force la progression à 50 pour faire une barre d'attente indéterminée
    setExportProgress(50);

    try {
      const outputPath = `${RNFS.DownloadDirectoryPath}/${exportName || projectName}.mp4`;
      
      const mainClips = clips.filter(c => (c.channel || 0) === 0);
      if (mainClips.length === 0) {
        Alert.alert("Erreur", "Aucun clip principal à exporter.");
        setIsExporting(false);
        return;
      }

      let w = 720, h = 1280;
      if (exportResolution === '1080p') { w = 1080; h = 1920; }
      else if (exportResolution === '4K') { w = 2160; h = 3840; }
      
      if (projectFormat === '16:9') { const temp = w; w = h; h = temp; }
      else if (projectFormat === '1:1') { h = w; }
      else if (projectFormat === '4:3') { h = Math.round((w * 3) / 4); }

      const totalVideoDuration = clips.reduce((acc, c) => Math.max(acc, (c.startOffset || 0) + c.duration / (c.speed || 1.0)), 0);
      const totalAudioDuration = audioClips.reduce((acc, a) => Math.max(acc, a.startOffset + a.duration), 0);
      const totalDuration = Math.max(totalVideoDuration, totalAudioDuration, 1); // minimum 1s

      let ffmpegArgs: string[] = [];
      
      // 1. Inputs Vidéos et Images
      clips.forEach(clip => {
        if (clip.type === 'image') {
          ffmpegArgs.push('-loop', '1');
        }
        ffmpegArgs.push('-i', clip.uri);
      });
      // 2. Inputs Audio (Musique)
      audioClips.forEach(audio => {
        ffmpegArgs.push('-i', audio.uri);
      });

      let filterGraph = '';
      
      // Création du Canvas de fond noir
      filterGraph += `color=c=black:s=${w}x${h}:d=${totalDuration}:r=30[bg0]; `;

      let audioInputs = '';
      let audioInputCount = 0;
      let bgIndex = 0;

      // 3. Traitement de chaque clip (Vidéo/Image)
      clips.forEach((clip, index) => {
        const start = clip.trimStart || 0;
        const dur = clip.duration;
        const speed = clip.speed || 1.0;
        const timelineStart = clip.startOffset || 0;
        const timelineEnd = timelineStart + (dur / speed);
        
        const scale = clip.scale ?? 1.0;
        const xOffset = clip.x ?? 0;
        const yOffset = clip.y ?? 0;

        // Chaîne vidéo
        let vChain = `[${index}:v]`;
        if (clip.type === 'video') {
          vChain += `trim=start=${start}:duration=${dur},setpts=(1/${speed})*(PTS-STARTPTS),`;
        } else {
          vChain += `trim=start=0:duration=${dur},setpts=PTS-STARTPTS,`;
        }
        
        // Rotation FFMPEG (avec c=none pour fond transparent)
        const rot = clip.rotation || 0;
        if (rot !== 0) {
          vChain += `rotate=${rot}*PI/180:c=none,`;
        }

        // Redimensionnement FFMPEG (TRUNC obligatoire pour éviter le bug d'affichage / nombres impairs)
        vChain += `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2`;
        
        // Transitions (uniquement fade pour la stabilité)
        if (index > 0) {
           const prevClip = clips[index - 1];
           if (prevClip && prevClip.transition === 'fade') {
               vChain += `,format=rgba,fade=t=in:st=0:d=0.5:alpha=1`;
           }
        }
        vChain += `[v${index}_scaled]; `;

        // Placer sur le fond
        filterGraph += vChain;
        filterGraph += `[bg${bgIndex}][v${index}_scaled]overlay=x=(W-w)/2+${xOffset}:y=(H-h)/2+${yOffset}:enable='between(t,${timelineStart},${timelineEnd})'[bg${bgIndex + 1}]; `;
        bgIndex++;

        // Traitement des textes
        if (clip.textOverlays && clip.textOverlays.length > 0) {
          clip.textOverlays.forEach((txt, tIdx) => {
             // drawtext simple sans fontfile (utilise la font système si ffmpeg le permet)
             const safeText = txt.text.replace(/'/g, "\\'").replace(/:/g, "\\:");
             filterGraph += `[bg${bgIndex}]drawtext=text='${safeText}':fontsize=48:fontcolor=white:x=(w-text_w)/2+${txt.x}:y=(h-text_h)/2+${txt.y}:enable='between(t,${timelineStart},${timelineEnd})'[bg${bgIndex+1}]; `;
             bgIndex++;
          });
        }

        // Chaîne Audio (uniquement pour vidéos)
        if (clip.type === 'video') {
          const vol = clip.volume !== undefined ? clip.volume : 1.0;
          filterGraph += `[${index}:a]atrim=start=${start}:duration=${dur},asetpts=PTS-STARTPTS,atempo=${speed},volume=${vol},adelay=${Math.round(timelineStart * 1000)}|${Math.round(timelineStart * 1000)}[a${index}_ready]; `;
          audioInputs += `[a${index}_ready]`;
          audioInputCount++;
        }
      });

      // 4. Traitement de la Musique de fond
      audioClips.forEach((audio, idx) => {
        const inputIndex = clips.length + idx;
        const timelineStart = audio.startOffset;
        filterGraph += `[${inputIndex}:a]atrim=start=${audio.trimStart}:duration=${audio.duration},asetpts=PTS-STARTPTS,volume=1.0,adelay=${Math.round(timelineStart * 1000)}|${Math.round(timelineStart * 1000)}[bg_audio_${idx}]; `;
        audioInputs += `[bg_audio_${idx}]`;
        audioInputCount++;
      });

      // Mixage final audio
      if (audioInputCount > 0) {
        filterGraph += `${audioInputs}amix=inputs=${audioInputCount}:duration=first[outa]`;
      } else {
        // Fallback s'il n'y a absolument aucun son (générer un silence)
        filterGraph += `anullsrc=r=44100:cl=stereo[outa]`;
      }

      ffmpegArgs.push('-filter_complex');
      ffmpegArgs.push(`"${filterGraph}"`);
      ffmpegArgs.push('-map');
      ffmpegArgs.push(`[bg${bgIndex}]`);
      ffmpegArgs.push('-map');
      ffmpegArgs.push('[outa]');
      ffmpegArgs.push('-c:v');
      ffmpegArgs.push('mpeg4');
      ffmpegArgs.push('-c:a');
      ffmpegArgs.push('aac');
      ffmpegArgs.push('-b:a');
      ffmpegArgs.push('192k');
      ffmpegArgs.push('-r');
      ffmpegArgs.push('30');
      ffmpegArgs.push('-t');
      ffmpegArgs.push(`${totalDuration}`);
      ffmpegArgs.push('-y');
      ffmpegArgs.push(outputPath);

      // On compile la commande en une seule string pour react-native-ffmpeg-lib
      const commandString = ffmpegArgs.join(' ');
      console.log('FFMPEG CMD:', commandString);
      
      const result = await FFmpeg.execute(commandString);
      
      setIsExporting(false);

      if (result.returnCode === 0) {
        setExportProgress(100);
        setExportPreviewPath(`file://${outputPath}`);
        setIsExportPreviewVisible(true);
      } else {
        console.log('FFMPEG ERREUR:', result.output);
        Alert.alert("Erreur d'export", "Erreur native.");
      }
    } catch (e) {
      console.log('Exception export:', e);
      setIsExporting(false);
      Alert.alert("Erreur", "Exception lors de l'export.");
    }
  };

  let aspectRatio = 9 / 16;
  if (projectFormat === '16:9') aspectRatio = 16 / 9;
  else if (projectFormat === '1:1') aspectRatio = 1;
  else if (projectFormat === '4:3') aspectRatio = 4 / 3;

  const isVertical = projectFormat === '9:16';
  const frameStyle = {
    aspectRatio,
    height: (isVertical ? '90%' : undefined) as any,
    width: (isVertical ? undefined : '95%') as any,
    maxHeight: '100%' as const,
    maxWidth: '100%' as const,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    alignSelf: 'center' as const,
    borderColor: '#222222',
    borderWidth: 1,
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Audio Players */}
      {audioClips.map((audio) => (
        <BackgroundAudioPlayer
          key={audio.id}
          uri={audio.uri}
          startOffset={audio.startOffset}
          duration={audio.duration}
          currentTime={currentTime}
          isPlaying={isPlaying}
        />
      ))}

      {/* En-tête (Header) */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.headerIcon}>⟨</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{projectName}</Text>
        <AnimatedNeonButton style={styles.exportButton} onPress={openExportSettings}>
          <Text style={styles.exportButtonText}>Exporter</Text>
        </AnimatedNeonButton>
      </View>

      {/* Zone de prévisualisation (Preview Area) */}
      <TouchableOpacity
        style={styles.previewArea}
        activeOpacity={1}
        onPress={() => {
          setSelectedClipIndex(null);
          setSelectedAudioIndex(null);
        }}
      >
        {/* Graphique de son fixe en haut à gauche (délié de la vidéo) */}
        {isPlaying && (
          <View style={styles.liveAudioBarsRow}>
            {Array.from({ length: 8 }).map((_, barIdx) => {
              const barHeight = Math.max(5, Math.floor(Math.abs(Math.sin(currentTime * (barIdx + 1))) * 20 + 8));
              return (
                <View
                  key={barIdx}
                  style={[styles.liveAudioBar, { height: barHeight }]}
                />
              );
            })}
          </View>
        )}

        <View style={frameStyle} {...panResponder.panHandlers}>
          {bufferedClipsAtTime.length > 0 ? (
            bufferedClipsAtTime.sort((a, b) => (a.channel || 0) - (b.channel || 0)).map((clip) => {
              const isSelected = selectedClipIndex === clips.indexOf(clip);

              // Déterminer si le clip est réellement actif (visible et lisible)
              const start = clip.startOffset || 0;
              const speed = clip.speed || 1;
              const end = start + clip.duration / speed;
              const isActive = currentTime >= start && currentTime <= end;

              const clipLocal = Math.max(0, currentTime - start) * speed;
              const props = getInterpolatedProps(clip, clipLocal);

              // Application des transitions réelles
              let transOpacity = 1;
              let transScale = 1;
              let transX = 0;
              let transY = 0;
              let isGlitch = false;
              let isBlur = false;

              const idx = clips.indexOf(clip);
              const isChannel0 = (clip.channel || 0) === 0;

              if (isChannel0) {
                const transitionDuration = 0.5; // durée de la transition (sec)
                const clipEnd = (clip.startOffset || 0) + clip.duration / (clip.speed || 1.0);

                // 1. Transition de sortie (Fin du clip actuel)
                if (clip.transition && clip.transition !== 'none' && clipEnd - currentTime <= transitionDuration && clipEnd - currentTime > 0) {
                  const progress = (clipEnd - currentTime) / transitionDuration; // 1 -> 0
                  if (clip.transition === 'fade') {
                    transOpacity = progress;
                  } else if (clip.transition === 'zoom') {
                    transScale = 1 + (1 - progress) * 0.5;
                  } else if (clip.transition === 'glitch') {
                    isGlitch = true;
                    transX = (Math.random() - 0.5) * 30;
                    transY = (Math.random() - 0.5) * 30;
                  } else if (clip.transition === 'blur') {
                    isBlur = true;
                    transOpacity = 0.3 + progress * 0.7;
                  }
                }

                // 2. Transition d'entrée (Début du clip actuel, héritée de la transition du clip précédent)
                if (idx > 0) {
                  const prevClip = clips[idx - 1];
                  if (prevClip && prevClip.transition && prevClip.transition !== 'none' && currentTime - (clip.startOffset || 0) <= transitionDuration && currentTime - (clip.startOffset || 0) > 0) {
                    const progress = (currentTime - (clip.startOffset || 0)) / transitionDuration; // 0 -> 1
                    if (prevClip.transition === 'fade') {
                      transOpacity = progress;
                    } else if (prevClip.transition === 'zoom') {
                      transScale = 1.5 - progress * 0.5;
                    } else if (prevClip.transition === 'glitch') {
                      isGlitch = true;
                      transX = (Math.random() - 0.5) * 30;
                      transY = (Math.random() - 0.5) * 30;
                    } else if (prevClip.transition === 'blur') {
                      isBlur = true;
                      transOpacity = 0.3 + progress * 0.7;
                    }
                  }
                }
              }

              const clipRatio = mediaAspectRatios[clip.id] || aspectRatio;

              return (
                <View
                  key={clip.id}
                  style={[
                    {
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      justifyContent: 'center',
                      alignItems: 'center'
                    },
                    {
                      transform: [
                        { scale: props.scale * transScale },
                        { rotate: `${props.rotation}deg` },
                        { translateX: props.x + transX },
                        { translateY: props.y + transY }
                      ],
                      opacity: isActive ? props.opacity * transOpacity : 0 // Caché si en buffer mais pas actif
                    }
                  ]}
                  renderToHardwareTextureAndroid={true} // Obligatoire sur Android pour que la rotation affecte les enfants natifs (Vidéo)
                >
                  <View style={[
                    {
                      aspectRatio: clipRatio,
                      width: clipRatio > 1 ? '100%' : undefined,
                      height: clipRatio <= 1 ? '100%' : undefined,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      justifyContent: 'center',
                      alignItems: 'center',
                      position: 'relative'
                    },
                    isSelected && { borderColor: theme.colors.primary, borderWidth: 1.5 }
                  ]}>
                    {clip.type === 'image' ? (
                      <Image
                        source={{ uri: clip.uri }}
                        style={styles.previewImage}
                        resizeMode="contain"
                        blurRadius={isBlur ? 15 : undefined}
                        onLoad={(e) => {
                          const { width, height } = e.nativeEvent.source;
                          if (width && height) {
                            handleMediaLoad(clip.id, width / height);
                          }
                        }}
                      />
                    ) : (
                      <View style={styles.videoPlayerContainer}>
                        {/* Vrai Lecteur Vidéo de fond */}
                        <VideoPlayer
                          uri={clip.uri}
                          localTime={clipLocal + (clip.trimStart || 0)}
                          isPlaying={isPlaying}
                          isActive={isActive}
                          style={StyleSheet.absoluteFill}
                          speed={clip.speed}
                          onLoad={(ratio) => handleMediaLoad(clip.id, ratio)}
                        />

                        {/* Calque de Flou */}
                        {isBlur && (
                          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.35)' }]} pointerEvents="none" />
                        )}

                        {/* Calque de Glitch */}
                        {isGlitch && (
                          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 255, 230, 0.25)', zIndex: 10 }]} pointerEvents="none" />
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.previewPlaceholderText}>Aucun média sous la playhead</Text>
          )}

          {/* Rendu des textes du clip actif avec possibilité de déplacement */}
          {activeClip?.textOverlays?.map((txt, index) => {
            const isSelected = selectedTextIndex === index;
            return (
              <TouchableOpacity
                key={txt.id}
                onPress={() => setSelectedTextIndex(index)}
                style={{
                  position: 'absolute',
                  transform: [
                    { translateX: txt.x },
                    { translateY: txt.y }
                  ],
                  borderColor: isSelected ? theme.colors.primary : 'transparent',
                  borderWidth: isSelected ? 1.5 : 0,
                  padding: 6,
                  borderRadius: 4,
                  backgroundColor: isSelected ? 'rgba(139, 92, 246, 0.25)' : 'transparent'
                }}
              >
                <Text style={{ color: txt.color, fontSize: 24, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 }}>
                  {txt.text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Boutons d'annulation / Rétablissement (Undo/Redo) */}
        <View style={styles.undoRedoOverlay}>
          <TouchableOpacity
            style={[styles.actionIconBtn, historyIndexRef.current <= 0 && { opacity: 0.3 }]}
            onPress={handleUndo}
            disabled={historyIndexRef.current <= 0}
          >
            <Text style={styles.undoRedoText}>⟲</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionIconBtn, historyIndexRef.current >= historyRef.current.length - 1 && { opacity: 0.3 }]}
            onPress={handleRedo}
            disabled={historyIndexRef.current >= historyRef.current.length - 1}
          >
            <Text style={styles.undoRedoText}>⟳</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* BARRE DE CONTRÔLE CENTRALE (Entre preview et timeline) */}
      <View style={styles.middleControlBar}>
        {/* Temps actuel / Temps total */}
        <Text style={styles.timeText}>
          {`${formatTime(currentTime)} / ${formatTime(totalDuration)}`}
        </Text>

        {/* Boutons principaux au centre */}
        <View style={styles.centerControlsRow}>
          {/* Lecture / Pause */}
          <TouchableOpacity
            style={[styles.middleCircleBtn, isPlaying && styles.activeMiddleBtn, { justifyContent: 'center', alignItems: 'center' }]}
            onPress={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: 10, height: 12 }}>
                <View style={{ width: 3.5, height: '100%', backgroundColor: '#ffffff', borderRadius: 1 }} />
                <View style={{ width: 3.5, height: '100%', backgroundColor: '#ffffff', borderRadius: 1 }} />
              </View>
            ) : (
              <View style={{
                width: 0,
                height: 0,
                backgroundColor: 'transparent',
                borderStyle: 'solid',
                borderLeftWidth: 12,
                borderRightWidth: 0,
                borderBottomWidth: 7,
                borderTopWidth: 7,
                borderLeftColor: '#ffffff',
                borderRightColor: 'transparent',
                borderBottomColor: 'transparent',
                borderTopColor: 'transparent',
                marginLeft: 3,
              }} />
            )}
          </TouchableOpacity>

          {/* Outil de découpe rapide (Cut / Split) */}
          <TouchableOpacity
            style={[
              styles.middleCircleBtn,
              (selectedClipIndex === null) && styles.disabledMiddleBtn,
              { justifyContent: 'center', alignItems: 'center' }
            ]}
            onPress={handleSplitClip}
            disabled={selectedClipIndex === null}
          >
            <Text style={[styles.middleBtnText, { fontSize: 18, color: '#ffffff' }]}>✂</Text>
          </TouchableOpacity>
        </View>

        {/* Bouton pour ajouter un média */}
        <TouchableOpacity style={styles.quickAddBtn} onPress={handleAddClips}>
          <Text style={styles.quickAddBtnText}>+ Ajouter</Text>
        </TouchableOpacity>
      </View>

      {/* Zone Timeline (Timeline Area) */}
      <View style={styles.timelineArea}>
        {/* Contrôles du Zoom de la Timeline */}
        <View style={styles.zoomControlsRow}>
          <Text style={styles.zoomTitleText}>Zoom : {zoomLevel.toFixed(1)}x</Text>
          <CustomSlider
            value={zoomLevel}
            onChange={(val: number) => setZoomLevel(val)}
            min={0.1}
            max={2.0}
          />
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.zoomBtn, isMagnetEnabled && styles.activeZoomBtn, { paddingHorizontal: 10 }]}
            onPress={() => setIsMagnetEnabled(!isMagnetEnabled)}
          >
            <Text style={styles.zoomBtnText}>{isMagnetEnabled ? '🧲 Aimant : Oui' : '🧲 Aimant : Non'}</Text>
          </TouchableOpacity>
        </View>

        {/* La piste de montage défilante */}
        {clips.length === 0 ? (
          // Timeline vide : Bouton d'ajout géant
          <TouchableOpacity style={styles.emptyTimelineBtn} onPress={handleAddClips}>
            <Text style={styles.emptyTimelineIcon}>+</Text>
            <Text style={styles.emptyTimelineText}>Appuyez pour importer des médias</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1 }}>
            {/* ScrollView principal pour la vidéo et l'audio */}
            <ScrollView
              ref={timelineRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.timelineScroll}
              scrollEventThrottle={16}
              onScroll={handleScroll}
              scrollEnabled={isTimelineScrollingEnabled}
            >
              <View style={[{ paddingVertical: 10, position: 'relative' }, { width: Math.max(Dimensions.get('window').width, totalDuration * pxPerSecond) }]}>
                {/* Règle temporelle graduée (Intégrée au scroll) */}
                <View style={[styles.timeRuler, { borderBottomWidth: 0.5, borderColor: '#222222' }]}>
                  {Array.from({ length: Math.ceil(totalDuration / 5) + 2 }).map((_, i) => (
                    <Text key={i} style={[styles.rulerTime, { width: 5 * pxPerSecond }]}>
                      {formatTime(i * 5)}
                    </Text>
                  ))}
                </View>

                <View style={styles.tracksContainer}>
                  {/* Container unique pour toutes les pistes vidéo */}
                  {(() => {
                    const maxChannel = clips.reduce((acc, c) => Math.max(acc, c.channel || 0), 0);
                    const trackCount = Math.max(2, maxChannel + 2);
                    const timelineWidth = Math.max(Dimensions.get('window').width, totalDuration * pxPerSecond);

                    return (
                      <View style={{ height: trackCount * 78, width: timelineWidth, position: 'relative' }}>
                        <TouchableOpacity
                          activeOpacity={1}
                          style={StyleSheet.absoluteFill}
                          onPress={() => {
                            setSelectedClipIndex(null);
                            setSelectedAudioIndex(null);
                          }}
                        />
                        {/* Lignes d'arrière-plan pour chaque piste */}
                        {Array.from({ length: trackCount }).map((_, channelIndex) => {
                          const topPos = (trackCount - 1 - channelIndex) * 78;
                          return (
                            <View
                              key={channelIndex}
                              style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                top: topPos,
                                height: 70,
                                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                borderBottomWidth: 1,
                                borderBottomColor: 'rgba(255, 255, 255, 0.06)',
                                justifyContent: 'center',
                                paddingLeft: Dimensions.get('window').width / 2 + 10,
                              }}
                              pointerEvents="none"
                            >
                              <Text style={{ color: '#555555', fontSize: 10, fontWeight: 'bold' }}>
                                Piste {channelIndex + 1} {channelIndex === 0 ? '(Principale)' : '(Incrustation)'}
                              </Text>
                            </View>
                          );
                        })}

                        {/* Rendu de tous les clips de manière absolue */}
                        {clips.map((clip, clipIdx) => {
                          const channelIndex = clip.channel || 0;
                          const clipTop = (trackCount - 1 - channelIndex) * 78 + 5;
                          const isSelected = selectedClipIndex === clipIdx;

                          return (
                            <VideoClipBlock
                              key={clip.id}
                              clip={clip}
                              index={clipIdx}
                              isActive={isSelected}
                              showTrimHandles={isSelected && !isDragToolActive}
                              pxPerSecond={pxPerSecond}
                              onPress={handleClipPress}
                              openTransitionMenu={openTransitionMenu}
                              isLast={clipIdx === clips.length - 1}
                              isAbsolute={true}
                              absoluteTop={clipTop}
                              isMagnetEnabled={isMagnetEnabled}
                              allClips={clips}
                              onTrim={handleTrim}
                              onDrag={handleDrag}
                              onTrimEnd={handleTrimEnd}
                              setIsTimelineScrollingEnabled={setIsTimelineScrollingEnabled}
                              isDragToolActive={isDragToolActive}
                            />
                          );
                        })}
                      </View>
                    );
                  })()}

                  {/* 3. PISTE AUDIO DÉDIÉE (Waveform colorée mémoïsée) */}
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => {
                      setSelectedClipIndex(null);
                      setSelectedAudioIndex(null);
                    }}
                    style={[styles.audioTrackRow, { marginTop: 10 }]}
                  >
                    {audioClips.map((audio, idx) => (
                      <AudioClipBlockComponent
                        key={audio.id}
                        audio={audio}
                        index={idx}
                        isActive={selectedAudioIndex === idx}
                        onPress={handleAudioPress}
                        onDrag={handleAudioDrag}
                        onTrim={handleAudioTrim}
                        onTrimEnd={handleAudioTrimEnd}
                        pxPerSecond={pxPerSecond}
                        setIsTimelineScrollingEnabled={setIsTimelineScrollingEnabled}
                        isDragToolActive={isDragToolActive}
                      />
                    ))}
                    {audioClips.length === 0 && (
                      <Text style={styles.emptyAudioTrackText}>
                        Aucune piste audio - Utilisez l'outil Audio pour en ajouter une
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.timelineMargin} />
            </ScrollView>
          </View>
        )}

        {/* Tête de lecture (Vertical Playhead) fixe au centre */}
        {clips.length > 0 && (
          <View style={styles.playhead} pointerEvents="none">
            <View style={styles.playheadDot} />
            <View style={styles.playheadLine} />
          </View>
        )}
      </View>

      {/* Zone Panneau de Outils (Bottom Tools Bar) */}
      <View style={[styles.bottomToolsBar, currentPanel === 'properties' && { height: 220 }]}>
        {currentPanel === 'main' ? (
          // PANNEAU PRINCIPAL
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsScroll}>
            <TouchableOpacity style={styles.formatBadge}>
              <Text style={styles.formatBadgeText}>FORMAT</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={() => setIsAudioModalVisible(true)}>
              <Text style={[styles.toolIcon, { color: '#ffffff' }]}>♪</Text>
              <Text style={styles.toolLabel}>Audio</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toolBtn, !activeClip && styles.disabledToolBtn]}
              onPress={() => activeClip && setCurrentPanel('properties')}
              disabled={!activeClip}
            >
              <Text style={[styles.toolIcon, { color: '#ffffff' }]}>⚙</Text>
              <Text style={styles.toolLabel}>Propriétés</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={() => setCurrentPanel('edit')}>
              <Text style={[styles.toolIcon, { color: '#ffffff' }]}>✂</Text>
              <Text style={styles.toolLabel}>Modifier</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={() => setCurrentPanel('ratio')}>
              <Text style={[styles.toolIcon, { color: '#ffffff' }]}>⛶</Text>
              <Text style={styles.toolLabel}>Ratio</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={() => setCurrentPanel('text')}>
              <Text style={[styles.toolIcon, { color: '#ffffff' }]}>T</Text>
              <Text style={styles.toolLabel}>Texte</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={() => {
              if (activeClipIndex === null) {
                Alert.alert("Sélection requise", "Sélectionnez l'interstice entre deux clips pour y ajouter une transition.");
              } else {
                openTransitionMenu(0);
              }
            }}>
              <Text style={[styles.toolIcon, { color: '#ffffff' }]}>⚡</Text>
              <Text style={styles.toolLabel}>Transitions</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toolBtn, isDragToolActive && { backgroundColor: theme.colors.surfaceLight, borderRadius: 8 }]} 
              onPress={() => setIsDragToolActive(!isDragToolActive)}
            >
              <Text style={[styles.toolIcon, isDragToolActive && { color: theme.colors.primary }]}>✋</Text>
              <Text style={[styles.toolLabel, isDragToolActive && { color: theme.colors.primary }]}>Déplacer</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : currentPanel === 'edit' ? (
          // PANNEAU D'ÉDITION (Sous-outils)
          <View style={styles.editingPanelContainer}>
            <TouchableOpacity style={styles.backToMainBtn} onPress={() => setCurrentPanel('main')}>
              <Text style={styles.backToMainArrow}>⟨</Text>
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsScroll}>
              <TouchableOpacity style={styles.toolBtn} onPress={handleAddClips}>
                <Text style={[styles.toolIcon, { color: '#ffffff', fontSize: 20 }]}>+</Text>
                <Text style={styles.toolLabel}>Ajouter</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolBtn, (selectedClipIndex === null) && styles.disabledToolBtn]}
                onPress={handleSplitClip}
                disabled={selectedClipIndex === null}
              >
                <Text style={[styles.toolIcon, { color: '#ffffff' }]}>✂</Text>
                <Text style={styles.toolLabel}>Diviser</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolBtn, (selectedClipIndex === null && selectedAudioIndex === null) && styles.disabledToolBtn]}
                onPress={handleDeleteClip}
                disabled={selectedClipIndex === null && selectedAudioIndex === null}
              >
                <Text style={[styles.toolIcon, { color: '#ffffff' }]}>🗑</Text>
                <Text style={styles.toolLabel}>Supprimer</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        ) : currentPanel === 'properties' ? (
          // PANNEAU DES PROPRIÉTÉS PHYSIQUES ET KEYFRAMES
          <View style={styles.propertiesPanelContainer}>
            <View style={styles.propertiesHeaderRow}>
              <TouchableOpacity style={styles.backToMainBtn} onPress={() => setCurrentPanel('main')}>
                <Text style={styles.backToMainArrow}>⟨</Text>
              </TouchableOpacity>
              <Text style={styles.propertiesPanelTitle}>Propriétés & Keyframes</Text>

              {/* Bouton de Keyframe Diamond ◊ */}
              <TouchableOpacity
                style={[
                  styles.timelineKeyframeBtn,
                  hasKeyframeAtCurrentTime && styles.activeKeyframeBtn
                ]}
                onPress={toggleKeyframe}
              >
                <Text style={styles.keyframeBtnText}>
                  {hasKeyframeAtCurrentTime ? '♦ Retirer' : '◊ Poser Keyframe'}
                </Text>
              </TouchableOpacity>
            </View>

            {activeClip && (
              <ScrollView 
                style={styles.slidersScrollView} 
                showsVerticalScrollIndicator={false}
                scrollEnabled={!isSliderDragging}
              >
                {/* Slider Échelle */}
                <View style={styles.sliderWrapper}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={styles.sliderLabel}>Échelle : {Math.round((activeClip.scale ?? 1.0) * 100)}%</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].scale = 1.0;
                        setClips(updated);
                      }}
                      style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#2A2A2A', borderRadius: 4 }}
                    >
                      <Text style={{ color: theme.colors.primary, fontSize: 9, fontWeight: 'bold' }}>Réinitialiser</Text>
                    </TouchableOpacity>
                  </View>
                  <CustomSlider
                    value={activeClip.scale ?? 1.0}
                    min={0.2}
                    max={3.0}
                    setIsDragging={setIsSliderDragging}
                    onChange={(val) => {
                      const updated = [...clips];
                      updated[activeClipIndex].scale = parseFloat(val.toFixed(2));
                      setClips(updated);
                    }}
                  />
                </View>

                {/* Slider Opacité */}
                <View style={styles.sliderWrapper}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={styles.sliderLabel}>Opacité : {Math.round((activeClip.opacity ?? 1.0) * 100)}%</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].opacity = 1.0;
                        setClips(updated);
                      }}
                      style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#2A2A2A', borderRadius: 4 }}
                    >
                      <Text style={{ color: theme.colors.primary, fontSize: 9, fontWeight: 'bold' }}>Réinitialiser</Text>
                    </TouchableOpacity>
                  </View>
                  <CustomSlider
                    value={activeClip.opacity ?? 1.0}
                    min={0.0}
                    max={1.0}
                    setIsDragging={setIsSliderDragging}
                    onChange={(val) => {
                      const updated = [...clips];
                      updated[activeClipIndex].opacity = parseFloat(val.toFixed(2));
                      setClips(updated);
                    }}
                  />
                </View>

                {/* Slider Rotation (Restauré pour tout type de clip) */}
                <View style={styles.sliderWrapper}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={styles.sliderLabel}>Rotation : {Math.round(activeClip.rotation ?? 0)}°</Text>
                    <TouchableOpacity
                        onPress={() => {
                          const updated = [...clips];
                          updated[activeClipIndex].rotation = 0;
                          setClips(updated);
                        }}
                        style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#2A2A2A', borderRadius: 4 }}
                      >
                        <Text style={{ color: theme.colors.primary, fontSize: 9, fontWeight: 'bold' }}>Réinitialiser</Text>
                      </TouchableOpacity>
                    </View>
                    <CustomSlider
                      value={activeClip.rotation ?? 0}
                      min={-180}
                      max={180}
                      setIsDragging={setIsSliderDragging}
                      onChange={(val) => {
                        const updated = [...clips];
                        updated[activeClipIndex].rotation = Math.round(val);
                        setClips(updated);
                      }}
                    />
                  </View>

                {/* Slider Vitesse */}
                <View style={styles.sliderWrapper}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={styles.sliderLabel}>Vitesse : {(activeClip.speed ?? 1.0).toFixed(2)}x</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].speed = 1.0;
                        setClips(updated);
                      }}
                      style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#2A2A2A', borderRadius: 4 }}
                    >
                      <Text style={{ color: theme.colors.primary, fontSize: 9, fontWeight: 'bold' }}>Réinitialiser</Text>
                    </TouchableOpacity>
                  </View>
                  <CustomSlider
                    value={activeClip.speed ?? 1.0}
                    min={0.25}
                    max={4.0}
                    setIsDragging={setIsSliderDragging}
                    onChange={(val) => {
                      const updated = [...clips];
                      updated[activeClipIndex].speed = parseFloat(val.toFixed(2));
                      setClips(updated);
                    }}
                  />
                </View>

                {/* Slider Position X */}
                <View style={styles.sliderWrapper}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={styles.sliderLabel}>Position X : {Math.round(activeClip.x ?? 0)}px</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].x = 0;
                        setClips(updated);
                      }}
                      style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#2A2A2A', borderRadius: 4 }}
                    >
                      <Text style={{ color: theme.colors.primary, fontSize: 9, fontWeight: 'bold' }}>Réinitialiser</Text>
                    </TouchableOpacity>
                  </View>
                  <CustomSlider
                    value={activeClip.x ?? 0}
                    min={-300}
                    max={300}
                    setIsDragging={setIsSliderDragging}
                    onChange={(val) => {
                      const updated = [...clips];
                      updated[activeClipIndex].x = Math.round(val);
                      setClips(updated);
                    }}
                  />
                </View>

                {/* Slider Position Y */}
                <View style={styles.sliderWrapper}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={styles.sliderLabel}>Position Y : {Math.round(activeClip.y ?? 0)}px</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].y = 0;
                        setClips(updated);
                      }}
                      style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#2A2A2A', borderRadius: 4 }}
                    >
                      <Text style={{ color: theme.colors.primary, fontSize: 9, fontWeight: 'bold' }}>Réinitialiser</Text>
                    </TouchableOpacity>
                  </View>
                  <CustomSlider
                    value={activeClip.y ?? 0}
                    min={-300}
                    max={300}
                    setIsDragging={setIsSliderDragging}
                    onChange={(val) => {
                      const updated = [...clips];
                      updated[activeClipIndex].y = Math.round(val);
                      setClips(updated);
                    }}
                  />
                </View>
              </ScrollView>
            )}
          </View>
        ) : currentPanel === 'transition' ? (
          // PANNEAU DE SÉLECTION DES TRANSITIONS
          <View style={styles.editingPanelContainer}>
            <TouchableOpacity style={styles.backToMainBtn} onPress={() => setCurrentPanel('main')}>
              <Text style={styles.backToMainArrow}>⟨</Text>
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsScroll}>
              <TouchableOpacity style={styles.transitionOption} onPress={() => selectTransition('none')}>
                <Text style={styles.transitionOptionText}>Aucune</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.transitionOption} onPress={() => selectTransition('fade')}>
                <Text style={styles.transitionOptionText}>🎥 Fondu</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.transitionOption} onPress={() => selectTransition('glitch')}>
                <Text style={styles.transitionOptionText}>⚡ Glitch</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.transitionOption} onPress={() => selectTransition('zoom')}>
                <Text style={styles.transitionOptionText}>🔍 Zoom</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.transitionOption} onPress={() => selectTransition('blur')}>
                <Text style={styles.transitionOptionText}>🌫️ Flou</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        ) : currentPanel === 'ratio' ? (
          // PANNEAU RATIO
          <View style={styles.editingPanelContainer}>
            <TouchableOpacity style={styles.backToMainBtn} onPress={() => setCurrentPanel('main')}>
              <Text style={styles.backToMainArrow}>⟨</Text>
            </TouchableOpacity>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsScroll}>
              {['9:16', '16:9', '1:1', '4:3'].map(fmt => (
                <TouchableOpacity
                  key={fmt}
                  style={[styles.transitionOption, projectFormat === fmt && styles.activeTransitionIndicator]}
                  onPress={() => setProjectFormat(fmt)}
                >
                  <Text style={styles.transitionOptionText}>{fmt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : currentPanel === 'text' ? (
          // PANNEAU TEXTE
          <View style={styles.editingPanelContainer}>
            <TouchableOpacity style={styles.backToMainBtn} onPress={() => setCurrentPanel('main')}>
              <Text style={styles.backToMainArrow}>⟨</Text>
            </TouchableOpacity>
            {activeClip && selectedTextIndex !== null && activeClip.textOverlays && activeClip.textOverlays[selectedTextIndex] ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Modifier le texte</Text>
                  <TouchableOpacity onPress={() => setSelectedTextIndex(null)}>
                    <Text style={{ color: theme.colors.primary, fontSize: 12 }}>Retour</Text>
                  </TouchableOpacity>
                </View>
                
                <TextInput
                  style={{ backgroundColor: '#1E1E1E', color: '#FFF', padding: 10, borderRadius: 8, marginBottom: 15 }}
                  value={activeClip.textOverlays[selectedTextIndex].text}
                  onChangeText={(val) => {
                    const updated = [...clips];
                    if (activeClipIndex !== null) {
                      updated[activeClipIndex].textOverlays![selectedTextIndex].text = val;
                      setClips(updated);
                    }
                  }}
                />
                
                <View style={styles.sliderWrapper}>
                  <Text style={styles.sliderLabel}>Position X : {Math.round(activeClip.textOverlays[selectedTextIndex].x)}</Text>
                  <CustomSlider
                    value={activeClip.textOverlays[selectedTextIndex].x}
                    min={-200}
                    max={200}
                    onChange={(val: number) => {
                      const updated = [...clips];
                      if (activeClipIndex !== null) {
                        updated[activeClipIndex].textOverlays![selectedTextIndex].x = val;
                        setClips(updated);
                      }
                    }}
                  />
                </View>
                
                <View style={styles.sliderWrapper}>
                  <Text style={styles.sliderLabel}>Position Y : {Math.round(activeClip.textOverlays[selectedTextIndex].y)}</Text>
                  <CustomSlider
                    value={activeClip.textOverlays[selectedTextIndex].y}
                    min={-300}
                    max={300}
                    onChange={(val: number) => {
                      const updated = [...clips];
                      if (activeClipIndex !== null) {
                        updated[activeClipIndex].textOverlays![selectedTextIndex].y = val;
                        setClips(updated);
                      }
                    }}
                  />
                </View>
                
                <TouchableOpacity
                  style={{ backgroundColor: '#ef4444', padding: 12, borderRadius: 8, marginTop: 20, alignItems: 'center' }}
                  onPress={() => {
                    const updated = [...clips];
                    if (activeClipIndex !== null) {
                      updated[activeClipIndex].textOverlays?.splice(selectedTextIndex, 1);
                      setClips(updated);
                      setSelectedTextIndex(null);
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Supprimer le texte</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsScroll}>
                <TouchableOpacity style={styles.transitionOption} onPress={handleAddText}>
                  <Text style={styles.transitionOptionText}>+ Ajouter du texte</Text>
                </TouchableOpacity>
                {activeClip?.textOverlays?.map((txt, idx) => (
                  <TouchableOpacity key={txt.id} style={styles.transitionOption} onPress={() => setSelectedTextIndex(idx)}>
                    <Text style={styles.transitionOptionText}>{txt.text.length > 10 ? txt.text.substring(0, 10) + '...' : txt.text}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>

      {/* MODAL POUR ECRIRE DU TEXTE */}
      <Modal visible={isTextModalVisible} transparent={true} animationType="slide">
        <View style={styles.textModalOverlay}>
          <View style={styles.textModalContent}>
            <TextInput
              style={styles.textInput}
              placeholder="Tapez votre texte ici..."
              placeholderTextColor="#888"
              value={currentText}
              onChangeText={setCurrentText}
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15 }}>
              <TouchableOpacity onPress={() => setIsTextModalVisible(false)} style={{ marginRight: 20 }}>
                <Text style={{ color: '#aaa', fontWeight: 'bold' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveText}>
                <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL POUR SELECTIONNER DE LA MUSIQUE (AUDIO) */}
      <Modal visible={isAudioModalVisible} transparent={true} animationType="slide">
        <View style={styles.textModalOverlay}>
          <View style={[styles.textModalContent, { backgroundColor: '#1E1E1E', maxHeight: '85%' }]}>
            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>Ajouter une Musique</Text>

            <ScrollView style={{ flexGrow: 0, maxHeight: 220 }} showsVerticalScrollIndicator={true}>
              {[
                { name: 'Lofi HipHop Beats', duration: 180 },
                { name: 'Summer Vibe Upbeat', duration: 210 },
                { name: 'Chill acoustic Guitar', duration: 150 },
                { name: 'Cyberpunk Synthwave', duration: 240 }
              ].map((song) => (
                <TouchableOpacity
                  key={song.name}
                  onPress={() => handleAddAudio(song.name)}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#333', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '500' }}>🎵 {song.name}</Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>{Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ borderTopWidth: 1, borderTopColor: '#333', marginTop: 15, paddingTop: 15 }}>
              <Text style={{ color: '#AAA', fontSize: 13, fontWeight: '600', marginBottom: 10 }}>Importer votre musique :</Text>

              <TouchableOpacity
                style={{ backgroundColor: '#2A2A2A', paddingVertical: 10, borderRadius: 6, alignItems: 'center', marginBottom: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: theme.colors.primary }}
                onPress={handlePickLocalAudio}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: 'bold', fontSize: 14 }}>📁 Sélectionner un fichier audio (.mp3, etc.)</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  placeholder="Nom de la chanson..."
                  placeholderTextColor="#666"
                  value={customAudioName}
                  onChangeText={setCustomAudioName}
                  style={{ flex: 1, backgroundColor: '#2A2A2A', color: '#FFF', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, marginRight: 10, fontSize: 13 }}
                />
                <TouchableOpacity
                  style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 6 }}
                  onPress={() => {
                    const val = customAudioName.trim();
                    if (val) {
                      handleAddAudio(val, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 180);
                      setCustomAudioName('');
                    } else {
                      Alert.alert("Nom requis", "Veuillez entrer un nom pour la musique.");
                    }
                  }}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20 }}>
              <TouchableOpacity onPress={() => setIsAudioModalVisible(false)}>
                <Text style={{ color: '#aaa', fontWeight: 'bold' }}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL PARAMETRES D'EXPORT */}
      <Modal visible={isExportSettingsVisible} transparent={true} animationType="fade">
        <View style={styles.exportModalOverlay}>
          <View style={styles.exportModalContent}>
            <Text style={styles.exportTitle}>Paramètres d'exportation</Text>

            <Text style={{ color: '#aaa', marginTop: 15, marginBottom: 5 }}>Nom de la vidéo</Text>
            <TextInput
              style={{ backgroundColor: theme.colors.surface, color: '#fff', padding: 10, borderRadius: 5, borderWidth: 1, borderColor: '#333' }}
              value={exportName}
              onChangeText={setExportName}
              placeholder="Ex: Ma Super Vidéo"
              placeholderTextColor="#555"
            />

            <Text style={{ color: '#aaa', marginTop: 15, marginBottom: 5 }}>Résolution</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {['720p', '1080p', '4K'].map(res => (
                <TouchableOpacity
                  key={res}
                  style={{
                    flex: 1, padding: 10, marginHorizontal: 5, borderRadius: 5,
                    backgroundColor: exportResolution === res ? theme.colors.primary : theme.colors.surface,
                    alignItems: 'center'
                  }}
                  onPress={() => setExportResolution(res)}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>{res}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 30 }}>
              <TouchableOpacity onPress={() => setIsExportSettingsVisible(false)} style={{ padding: 10, marginRight: 10 }}>
                <Text style={{ color: '#aaa', fontWeight: 'bold' }}>Annuler</Text>
              </TouchableOpacity>
              <AnimatedNeonButton
                style={styles.neonButton}
                onPress={startExport}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Enregistrer</Text>
              </AnimatedNeonButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL D'EXPORT (FFmpeg Mock) */}
      <Modal visible={isExporting} transparent={true} animationType="fade">
        <View style={styles.exportModalOverlay}>
          <View style={styles.exportModalContent}>
            <Text style={styles.exportTitle}>Génération en cours...</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${exportProgress}%` }]} />
            </View>
            <Text style={styles.exportProgressText}>{Math.round(exportProgress)}%</Text>
            <Text style={styles.exportSubText}>Assemblage des médias et des effets...</Text>
            <Text style={styles.exportWarning}>Veuillez ne pas fermer l'application.</Text>
          </View>
        </View>
      </Modal>
      {/* MODAL D'APERÇU D'EXPORT */}
      <Modal visible={isExportPreviewVisible} transparent={true} animationType="slide">
        <View style={[styles.exportModalOverlay, { backgroundColor: '#000000' }]}>
          <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
            <Text style={{ color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>Aperçu de l'export</Text>
            
            {exportPreviewPath && (
              <View style={{ width: '90%', aspectRatio: 9/16, backgroundColor: '#111', borderRadius: 10, overflow: 'hidden' }}>
                <Video
                  source={{ uri: exportPreviewPath as string }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                  controls={true}
                  repeat={true}
                />
              </View>
            )}

            <View style={{ flexDirection: 'row', marginTop: 30, justifyContent: 'center' }}>
              <AnimatedNeonButton
                style={styles.neonButton}
                onPress={() => setIsExportPreviewVisible(false)}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Fermer l'aperçu</Text>
              </AnimatedNeonButton>
            </View>
            <Text style={{ color: '#888', marginTop: 15, fontSize: 12 }}>
              La vidéo a bien été enregistrée dans vos téléchargements.
            </Text>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

export default VideoEditorScreen;
