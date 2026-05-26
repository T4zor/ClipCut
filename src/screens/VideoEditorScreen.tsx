import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Image, Modal, Platform, PermissionsAndroid, Alert, PanResponder, TextInput, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { theme } from '../theme';
import { StorageService, Clip, Keyframe, AudioClip, TextOverlay } from '../services/StorageService';

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
  pxPerSecond: number;
  onPress: (index: number) => void;
  openTransitionMenu: (index: number) => void;
  isLast: boolean;
  isAbsolute?: boolean;
}

const VideoClipBlock = React.memo(({ 
  clip, 
  index, 
  isActive, 
  pxPerSecond, 
  onPress, 
  openTransitionMenu, 
  isLast,
  isAbsolute = false
}: VideoClipBlockProps) => {
  const clipWidth = clip.duration * pxPerSecond;
  const numThumbs = Math.max(1, Math.floor(clipWidth / 55));
  const clipLeft = (clip.startOffset || 0) * pxPerSecond;

  return (
    <React.Fragment>
      <TouchableOpacity 
        style={[
          styles.clipBlock, 
          { width: clipWidth },
          isAbsolute && { position: 'absolute', left: clipLeft },
          isActive && styles.selectedClipBlock
        ]}
        onPress={() => onPress(index)}
      >
        <View style={styles.clipFilmStrip}>
          {Array.from({ length: numThumbs }).map((_, thumbIdx) => (
            clip.type === 'image' ? (
              <Image key={thumbIdx} source={{ uri: clip.uri }} style={styles.clipFilmThumbnail} />
            ) : (
              <View key={thumbIdx} style={[styles.clipFilmThumbnail, styles.videoClipThumbnail]}>
                <Text style={styles.videoThumbnailIcon}>🎬</Text>
              </View>
            )
          ))}
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
      </TouchableOpacity>

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
  pxPerSecond: number;
}

const AudioClipBlockComponent = React.memo(({ audio, pxPerSecond }: AudioClipBlockProps) => {
  const audioLeft = audio.startOffset * pxPerSecond;
  const audioWidth = audio.duration * pxPerSecond;

  return (
    <View 
      style={[
        styles.audioClipBlock, 
        { left: audioLeft, width: audioWidth }
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
    </View>
  );
});

const VideoEditorScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { projectId } = route.params || {};

  // États du projet
  const [projectName, setProjectName] = useState('Chargement...');
  const [projectFormat, setProjectFormat] = useState('9:16');
  const [clips, setClips] = useState<Clip[]>([]);
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timelineRef = React.useRef<ScrollView>(null);
  
  // États de l'UI
  const [currentPanel, setCurrentPanel] = useState<'main' | 'edit' | 'transition' | 'ratio' | 'text' | 'properties'>('main');
  const [zoomLevel, setZoomLevel] = useState(1.0); // Échelle Zoom (1x à 4x)

  // États pour Texte
  const [isTextModalVisible, setIsTextModalVisible] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(null);

  // États pour Audio
  const [isAudioModalVisible, setIsAudioModalVisible] = useState(false);

  // États pour Export
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Calcul du facteur px/sec de la timeline
  const pxPerSecond = 16 * zoomLevel;

  // Initialisation du projet
  React.useEffect(() => {
    if (projectId) {
      StorageService.getProjectById(projectId).then(proj => {
        if (proj) {
          setProjectName(proj.name);
          setProjectFormat(proj.format);
          setClips(proj.clips || []);
          setAudioClips(proj.audioClips || []);
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
          const totalVideo = clips.reduce((acc, c) => Math.max(acc, (c.startOffset || 0) + c.duration), 0);
          const totalAudio = audioClips.reduce((acc, a) => Math.max(acc, a.startOffset + a.duration), 0);
          const total = Math.max(totalVideo, totalAudio, 10);
          if (prev >= total && total > 0) {
            setIsPlaying(false);
            return total;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, clips, audioClips]);

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
  }, [currentTime, clips]);

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
        // Déterminer la position de fin de la piste principale (canal 0) pour commencer à la suite
        let currentOffset = 0;
        const track0Clips = clips.filter(c => (c.channel || 0) === 0);
        if (track0Clips.length > 0) {
          const lastClip = track0Clips[track0Clips.length - 1];
          currentOffset = (lastClip.startOffset || 0) + lastClip.duration;
        }

        const newClips: Clip[] = [];
        let runningOffset = currentOffset;
        
        result.assets.forEach(asset => {
          newClips.push({
            id: Date.now().toString() + '-' + Math.random().toString(),
            uri: asset.uri || '',
            type: asset.type?.startsWith('video') ? 'video' : 'image',
            fileName: asset.fileName || 'Média',
            transition: 'none',
            duration: 5,
            textOverlays: [],
            channel: 0,
            startOffset: runningOffset
          });
          runningOffset += 5;
        });
        
        setClips(prev => [...prev, ...newClips]);
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
        keyframes: clipToSplit.keyframes?.filter(k => k.time >= clipLocal).map(k => ({
          ...k,
          time: k.time - clipLocal
        })) || []
      };

      const updatedClips = [...clips];
      updatedClips.splice(selectedClipIndex, 1, newClip1, newClip2);
      
      setClips(updatedClips);
      setSelectedClipIndex(selectedClipIndex); // Garde le focus sur la première partie
    }
  };

  // Supprimer le clip sélectionné
  const handleDeleteClip = () => {
    if (selectedClipIndex !== null) {
      const updatedClips = clips.filter((_, i) => i !== selectedClipIndex);
      setClips(updatedClips);
      setSelectedClipIndex(updatedClips.length > 0 ? 0 : null);
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
      setCurrentPanel('main');
      setSelectedTransitionIndex(null);
    }
  };

  // Calcul du temps total (maximum entre vidéo et audio)
  // Calcul du temps total (maximum entre vidéo et audio)
  const totalVideoDuration = clips.reduce((acc, c) => Math.max(acc, (c.startOffset || 0) + c.duration), 0);
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

  // PanResponder pour déplacer le texte ou le média au doigt
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        setClips(prevClips => {
          if (activeClipIndex === null || !prevClips[activeClipIndex]) return prevClips;
          const updated = [...prevClips];
          const clip = updated[activeClipIndex];
          
          if (selectedTextIndex !== null && clip.textOverlays[selectedTextIndex]) {
            const txt = { ...clip.textOverlays[selectedTextIndex] };
            txt.x = (txt.x || 0) + gestureState.dx / 2;
            txt.y = (txt.y || 0) + gestureState.dy / 2;
            clip.textOverlays[selectedTextIndex] = txt;
          } else {
            clip.x = (clip.x || 0) + gestureState.dx / 2;
            clip.y = (clip.y || 0) + gestureState.dy / 2;
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
  const handleAddAudio = (songName: string) => {
    const newAudio: AudioClip = {
      id: Date.now().toString(),
      name: songName,
      uri: 'mock_audio_uri',
      duration: 15,
      startOffset: currentTime
    };
    setAudioClips([...audioClips, newAudio]);
    setIsAudioModalVisible(false);
  };

  // Lancement de l'Exportation
  const handleExport = () => {
    setIsExporting(true);
    setExportProgress(0);
    
    // MOCK FFmpeg (Simulation de compilation avec transition xfade + overlay texte + mix audio)
    let prog = 0;
    const interval = setInterval(() => {
      prog += Math.random() * 12; // progression organique
      if (prog >= 100) {
        prog = 100;
        clearInterval(interval);
        setTimeout(() => {
          setIsExporting(false);
          Alert.alert("Export Réussi 🎉", "Votre vidéo '"+projectName+".mp4' (avec xfade transitions, textes incrustés et mixages audio) a été générée avec succès !");
        }, 600);
      }
      setExportProgress(prog);
    }, 400);
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
      {/* En-tête (Header) */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.headerIcon}>⟨</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{projectName}</Text>
        <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
          <Text style={styles.exportButtonText}>Exporter</Text>
        </TouchableOpacity>
      </View>

      {/* Zone de prévisualisation (Preview Area) */}
      <View style={styles.previewArea}>
        <View style={frameStyle} {...panResponder.panHandlers}>
          {activeClipsAtTime.length > 0 ? (
            activeClipsAtTime.sort((a, b) => (a.channel || 0) - (b.channel || 0)).map((clip) => {
              const isSelected = selectedClipIndex === clips.indexOf(clip);
              const clipLocal = Math.max(0, currentTime - (clip.startOffset || 0)) * (clip.speed || 1);
              const props = getInterpolatedProps(clip, clipLocal);

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
                        { scale: props.scale },
                        { rotate: `${props.rotation}deg` },
                        { translateX: props.x },
                        { translateY: props.y }
                      ],
                      opacity: props.opacity
                    },
                    isSelected && { borderColor: theme.colors.primary, borderWidth: 1 }
                  ]}
                >
                  {clip.type === 'image' ? (
                    <Image source={{ uri: clip.uri }} style={styles.previewImage} resizeMode="contain" />
                  ) : (
                    <View style={styles.videoPlayerContainer}>
                      {/* Grille de caméra */}
                      <View style={styles.cameraGridLineH} />
                      <View style={styles.cameraGridLineV} />
                      
                      {/* Badge REC */}
                      <View style={styles.recBadgeRow}>
                        <View style={[styles.recDot, isPlaying && styles.recDotActive]} />
                        <Text style={styles.recText}>REC</Text>
                      </View>

                      {/* Icône play/pause centrale */}
                      <View style={styles.centerPlayIconContainer}>
                        <Text style={styles.centerPlayIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                      </View>

                      {/* Titre et timecode en bas */}
                      <View style={styles.videoBottomInfo}>
                        <Text style={styles.videoInfoTitle} numberOfLines={1}>{clip.fileName}</Text>
                        <Text style={styles.videoTimecode}>
                          {formatTime(clipLocal)} / {formatTime(clip.duration)}
                        </Text>
                      </View>

                      {/* Ondes audio animées de lecture */}
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
                    </View>
                  )}
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
          <TouchableOpacity style={styles.actionIconBtn}>
            <Text style={styles.undoRedoText}>⟲</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionIconBtn}>
            <Text style={styles.undoRedoText}>⟳</Text>
          </TouchableOpacity>
        </View>
      </View>

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
            style={[styles.middleCircleBtn, isPlaying && styles.activeMiddleBtn]} 
            onPress={() => setIsPlaying(!isPlaying)}
          >
            <Text style={styles.middleBtnText}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>

          {/* Outil de découpe rapide (Cut / Split) */}
          <TouchableOpacity 
            style={[styles.middleCircleBtn, selectedClipIndex === null && styles.disabledMiddleBtn]} 
            onPress={handleSplitClip}
            disabled={selectedClipIndex === null}
          >
            <Text style={styles.middleBtnText}>✂️</Text>
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
          <Text style={styles.zoomTitleText}>Zoom Timeline :</Text>
          <TouchableOpacity 
            style={[styles.zoomBtn, zoomLevel === 1.0 && styles.activeZoomBtn]}
            onPress={() => setZoomLevel(1.0)}
          >
            <Text style={styles.zoomBtnText}>1x</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.zoomBtn, zoomLevel === 2.0 && styles.activeZoomBtn]}
            onPress={() => setZoomLevel(2.0)}
          >
            <Text style={styles.zoomBtnText}>2x</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.zoomBtn, zoomLevel === 3.0 && styles.activeZoomBtn]}
            onPress={() => setZoomLevel(3.0)}
          >
            <Text style={styles.zoomBtnText}>3x</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.zoomBtn, zoomLevel === 4.0 && styles.activeZoomBtn]}
            onPress={() => setZoomLevel(4.0)}
          >
            <Text style={styles.zoomBtnText}>4x</Text>
          </TouchableOpacity>
        </View>

        {/* Règle temporelle graduée en haut */}
        <View style={styles.timeRuler}>
          <Text style={styles.rulerTime}>00:00</Text>
          {clips.map((_, i) => (
            <Text key={i} style={styles.rulerTime}>{`00:${(i + 1) * 5 < 10 ? '0' : ''}${(i + 1) * 5}`}</Text>
          ))}
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
            >
              <View style={styles.timelineMargin} />

              <View style={[styles.tracksContainer, { width: Math.max(Dimensions.get('window').width, totalDuration * pxPerSecond) }]}>
                {/* 1. PISTE VIDÉO SUPÉRIEURE (Canal 1 - Superposition) */}
                <View style={[styles.videoTrackRow, { position: 'relative' }]}>
                  {clips.filter(c => (c.channel || 0) === 1).map((clip) => (
                    <VideoClipBlock
                      key={clip.id}
                      clip={clip}
                      index={clips.indexOf(clip)}
                      isActive={selectedClipIndex === clips.indexOf(clip)}
                      pxPerSecond={pxPerSecond}
                      onPress={(idx) => {
                        setSelectedClipIndex(idx);
                        setSelectedTextIndex(null);
                      }}
                      openTransitionMenu={openTransitionMenu}
                      isLast={true}
                      isAbsolute={true}
                    />
                  ))}
                </View>

                {/* 2. PISTE VIDÉO PRINCIPALE (Canal 0) */}
                <View style={[styles.videoTrackRow, { position: 'relative', marginTop: 8 }]}>
                  {clips.filter(c => (c.channel || 0) === 0).map((clip, index, arr) => (
                    <VideoClipBlock
                      key={clip.id}
                      clip={clip}
                      index={clips.indexOf(clip)}
                      isActive={selectedClipIndex === clips.indexOf(clip)}
                      pxPerSecond={pxPerSecond}
                      onPress={(idx) => {
                        setSelectedClipIndex(idx);
                        setSelectedTextIndex(null);
                      }}
                      openTransitionMenu={openTransitionMenu}
                      isLast={index === arr.length - 1}
                      isAbsolute={true}
                    />
                  ))}
                </View>

                {/* 3. PISTE AUDIO DÉDIÉE (Waveform colorée mémoïsée) */}
                <View style={styles.audioTrackRow}>
                  {audioClips.map((audio) => (
                    <AudioClipBlockComponent
                      key={audio.id}
                      audio={audio}
                      pxPerSecond={pxPerSecond}
                    />
                  ))}
                  {audioClips.length === 0 && (
                    <Text style={styles.emptyAudioTrackText}>
                      Aucune piste audio - Utilisez l'outil Audio pour en ajouter une
                    </Text>
                  )}
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
              <Text style={styles.toolIcon}>🎵</Text>
              <Text style={styles.toolLabel}>Audio</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toolBtn, !activeClip && styles.disabledToolBtn]} 
              onPress={() => activeClip && setCurrentPanel('properties')}
              disabled={!activeClip}
            >
              <Text style={styles.toolIcon}>⚙️</Text>
              <Text style={styles.toolLabel}>Propriétés</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={() => setCurrentPanel('edit')}>
              <Text style={styles.toolIcon}>✂️</Text>
              <Text style={styles.toolLabel}>Modifier</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={() => setCurrentPanel('ratio')}>
              <Text style={styles.toolIcon}>⛶</Text>
              <Text style={styles.toolLabel}>Ratio</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={() => setCurrentPanel('text')}>
              <Text style={styles.toolIcon}>T</Text>
              <Text style={styles.toolLabel}>Texte</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolBtn} onPress={() => {
              if (activeClipIndex === null) {
                Alert.alert("Sélection requise", "Sélectionnez l'interstice entre deux clips pour y ajouter une transition.");
              } else {
                openTransitionMenu(0);
              }
            }}>
              <Text style={styles.toolIcon}>⚡</Text>
              <Text style={styles.toolLabel}>Transitions</Text>
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
                <Text style={styles.toolIcon}>➕</Text>
                <Text style={styles.toolLabel}>Ajouter</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.toolBtn, clips.length === 0 && styles.disabledToolBtn]} onPress={handleSplitClip} disabled={clips.length === 0}>
                <Text style={styles.toolIcon}>✂️</Text>
                <Text style={styles.toolLabel}>Diviser</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.toolBtn, clips.length === 0 && styles.disabledToolBtn]} onPress={handleDeleteClip} disabled={clips.length === 0}>
                <Text style={styles.toolIcon}>🗑️</Text>
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
              <ScrollView style={styles.slidersScrollView} showsVerticalScrollIndicator={false}>
                {/* Slider Échelle */}
                <View style={styles.sliderWrapper}>
                  <Text style={styles.sliderLabel}>Échelle : {Math.round((activeClip.scale ?? 1.0) * 100)}%</Text>
                  <View style={styles.sliderTrackRow}>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].scale = Math.max(0.5, (activeClip.scale ?? 1.0) - 0.1);
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>-</Text>
                    </TouchableOpacity>
                    <View style={styles.sliderBarContainer}>
                      <View style={[styles.sliderBarFill, { width: `${(((activeClip.scale ?? 1.0) - 0.5) / 1.5) * 100}%` }]} />
                    </View>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].scale = Math.min(2.0, (activeClip.scale ?? 1.0) + 0.1);
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Slider Opacité */}
                <View style={styles.sliderWrapper}>
                  <Text style={styles.sliderLabel}>Opacité : {Math.round((activeClip.opacity ?? 1.0) * 100)}%</Text>
                  <View style={styles.sliderTrackRow}>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].opacity = Math.max(0.0, (activeClip.opacity ?? 1.0) - 0.1);
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>-</Text>
                    </TouchableOpacity>
                    <View style={styles.sliderBarContainer}>
                      <View style={[styles.sliderBarFill, { width: `${(activeClip.opacity ?? 1.0) * 100}%` }]} />
                    </View>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].opacity = Math.min(1.0, (activeClip.opacity ?? 1.0) + 0.1);
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Slider Rotation */}
                <View style={styles.sliderWrapper}>
                  <Text style={styles.sliderLabel}>Rotation : {activeClip.rotation ?? 0}°</Text>
                  <View style={styles.sliderTrackRow}>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].rotation = Math.max(-180, (activeClip.rotation ?? 0) - 15);
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>-</Text>
                    </TouchableOpacity>
                    <View style={styles.sliderBarContainer}>
                      <View style={[styles.sliderBarFill, { width: `${(((activeClip.rotation ?? 0) + 180) / 360) * 100}%` }]} />
                    </View>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].rotation = Math.min(180, (activeClip.rotation ?? 0) + 15);
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Slider Vitesse */}
                <View style={styles.sliderWrapper}>
                  <Text style={styles.sliderLabel}>Vitesse : {(activeClip.speed ?? 1.0)}x</Text>
                  <View style={styles.sliderTrackRow}>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].speed = Math.max(0.5, (activeClip.speed ?? 1.0) - 0.25);
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>-</Text>
                    </TouchableOpacity>
                    <View style={styles.sliderBarContainer}>
                      <View style={[styles.sliderBarFill, { width: `${(((activeClip.speed ?? 1.0) - 0.5) / 1.5) * 100}%` }]} />
                    </View>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].speed = Math.min(2.0, (activeClip.speed ?? 1.0) + 0.25);
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sélecteur de Piste (Canal) */}
                <View style={styles.sliderWrapper}>
                  <Text style={styles.sliderLabel}>Piste :</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 4 }}>
                    <TouchableOpacity 
                      style={[
                        styles.transitionOption, 
                        { flex: 1, marginRight: 8, alignItems: 'center', paddingVertical: 6, height: 32 },
                        (activeClip.channel ?? 0) === 0 && styles.activeTransitionIndicator
                      ]}
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].channel = 0;
                        setClips(updated);
                      }}
                    >
                      <Text style={[styles.transitionOptionText, { fontSize: 11 }]}>Piste 1 (Principale)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[
                        styles.transitionOption, 
                        { flex: 1, alignItems: 'center', paddingVertical: 6, height: 32 },
                        (activeClip.channel ?? 0) === 1 && styles.activeTransitionIndicator
                      ]}
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].channel = 1;
                        setClips(updated);
                      }}
                    >
                      <Text style={[styles.transitionOptionText, { fontSize: 11 }]}>Piste 2 (Overlay)</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Slider Position (Décalage temporel) */}
                <View style={styles.sliderWrapper}>
                  <Text style={styles.sliderLabel}>Position : {(activeClip.startOffset ?? 0).toFixed(1)}s</Text>
                  <View style={styles.sliderTrackRow}>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].startOffset = Math.max(0.0, (activeClip.startOffset ?? 0) - 0.5);
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>-</Text>
                    </TouchableOpacity>
                    <View style={styles.sliderBarContainer}>
                      <View style={[styles.sliderBarFill, { width: `${Math.min(100, ((activeClip.startOffset ?? 0) / 20) * 100)}%` }]} />
                    </View>
                    <TouchableOpacity 
                      onPress={() => {
                        const updated = [...clips];
                        updated[activeClipIndex].startOffset = (activeClip.startOffset ?? 0) + 0.5;
                        setClips(updated);
                      }}
                      style={styles.sliderStepBtn}
                    >
                      <Text style={styles.sliderStepText}>+</Text>
                    </TouchableOpacity>
                  </View>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsScroll}>
              <TouchableOpacity style={styles.transitionOption} onPress={handleAddText}>
                <Text style={styles.transitionOptionText}>+ Ajouter du texte</Text>
              </TouchableOpacity>
            </ScrollView>
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
          <View style={[styles.textModalContent, { backgroundColor: '#1E1E1E' }]}>
            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>Ajouter une Musique</Text>
            
            {['Lofi HipHop Beats', 'Summer Vibe Upbeat', 'Chill acoustic Guitar', 'Cyberpunk Synthwave'].map((song) => (
              <TouchableOpacity 
                key={song} 
                onPress={() => handleAddAudio(song)} 
                style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#333' }}
              >
                <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '500' }}>🎵 {song}</Text>
              </TouchableOpacity>
            ))}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20 }}>
              <TouchableOpacity onPress={() => setIsAudioModalVisible(false)}>
                <Text style={{ color: '#aaa', fontWeight: 'bold' }}>Fermer</Text>
              </TouchableOpacity>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  exportButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.round,
  },
  exportButtonText: {
    color: theme.colors.text,
    fontWeight: 'bold',
    fontSize: 13,
  },
  previewArea: {
    flex: 3.5, 
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIconText: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  undoRedoOverlay: {
    position: 'absolute',
    right: theme.spacing.md,
    top: theme.spacing.md,
    flexDirection: 'row',
  },
  actionIconBtn: {
    marginLeft: theme.spacing.md,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  undoRedoText: {
    color: '#ffffff',
    fontSize: 22,
  },
  previewPlaceholderText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  // BARRE CENTRALE
  middleControlBar: {
    height: 50,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderColor: '#222222',
  },
  timeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  centerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  middleCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: theme.spacing.xs,
  },
  activeMiddleBtn: {
    backgroundColor: theme.colors.primary,
  },
  disabledMiddleBtn: {
    opacity: 0.4,
  },
  middleBtnText: {
    color: '#ffffff',
    fontSize: 14,
  },
  quickAddBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: theme.colors.primary,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  quickAddBtnText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  // TIMELINE
  timelineArea: {
    flex: 2.5, 
    backgroundColor: '#141414',
    position: 'relative',
  },
  timeRuler: {
    flexDirection: 'row',
    paddingLeft: Dimensions.get('window').width / 2, // Aligner sur la playhead
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderColor: '#222222',
  },
  rulerTime: {
    color: '#555555',
    fontSize: 10,
    fontFamily: 'monospace',
    width: 100, // Largeur fixe correspondant à la taille du bloc clip + transition
    textAlign: 'left',
  },
  timelineScroll: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  timelineMargin: {
    width: Dimensions.get('window').width / 2, 
  },
  emptyTimelineBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#444444',
    borderRadius: 8,
    margin: theme.spacing.md,
  },
  emptyTimelineIcon: {
    fontSize: 28,
    marginBottom: theme.spacing.xs,
  },
  emptyTimelineText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  clipBlock: {
    height: 60,
    backgroundColor: '#262626',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#444444',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  selectedClipBlock: {
    borderColor: '#ffffff', // Bordure blanche de sélection
  },
  clipFilmStrip: {
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  clipFilmThumbnail: {
    width: 55,
    height: '100%',
    resizeMode: 'cover',
    opacity: 0.6,
  },
  videoClipThumbnail: {
    backgroundColor: '#1b1b1b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoThumbnailIcon: {
    fontSize: 20,
  },
  clipBlockLabel: {
    color: '#ffffff',
    fontSize: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 2,
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    textAlign: 'center',
    zIndex: 5,
  },
  keyframeDotContainer: {
    position: 'absolute',
    top: 2,
    right: 4,
    flexDirection: 'row',
    zIndex: 10,
  },
  timelineKeyframeDiamond: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
    marginHorizontal: 1,
    textShadowColor: '#000',
    textShadowRadius: 2,
  },
  // ZOOM CONTROLS
  zoomControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    backgroundColor: '#0D0D0D',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  zoomTitleText: {
    color: '#888888',
    fontSize: 10,
    marginRight: 8,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  zoomBtn: {
    backgroundColor: '#222222',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
  },
  activeZoomBtn: {
    backgroundColor: theme.colors.primary,
  },
  zoomBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // TRACKS
  tracksContainer: {
    flexDirection: 'column',
  },
  videoTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 70,
  },
  audioTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderTopWidth: 1,
    borderTopColor: '#222222',
    backgroundColor: 'rgba(0,0,0,0.15)',
    position: 'relative',
    marginTop: 8,
  },
  audioClipBlock: {
    position: 'absolute',
    height: 32,
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    borderLeftColor: '#047857',
    overflow: 'hidden',
  },
  audioClipText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: 'bold',
    zIndex: 10,
    position: 'absolute',
    left: 6,
    top: 2,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
    width: '100%',
    paddingBottom: 4,
    paddingLeft: 4,
  },
  waveformBar: {
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    marginHorizontal: 1.5,
    borderRadius: 1,
  },
  emptyAudioTrackText: {
    color: '#444444',
    fontSize: 10,
    fontStyle: 'italic',
    paddingLeft: 20,
  },
  // PROPERTIES & KEYFRAMES PANEL
  propertiesPanelContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
  },
  propertiesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    paddingBottom: 8,
    marginBottom: 8,
  },
  propertiesPanelTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  timelineKeyframeBtn: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444444',
  },
  activeKeyframeBtn: {
    backgroundColor: theme.colors.primary,
    borderColor: '#ffffff',
  },
  keyframeBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  slidersScrollView: {
    flex: 1,
  },
  sliderWrapper: {
    marginBottom: 10,
  },
  sliderLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginBottom: 4,
  },
  sliderTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sliderStepBtn: {
    width: 28,
    height: 28,
    backgroundColor: '#2A2A2A',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderStepText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sliderBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: '#222222',
    borderRadius: 3,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  sliderBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  // TRANSITION
  transitionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: theme.spacing.xs,
    borderWidth: 1,
    borderColor: '#444444',
  },
  activeTransitionIndicator: {
    backgroundColor: theme.colors.primary,
    borderColor: '#ffffff',
  },
  transitionIndicatorText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  playhead: {
    position: 'absolute',
    top: 20,
    bottom: 0,
    left: Dimensions.get('window').width / 2,
    alignItems: 'center',
  },
  playheadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  playheadLine: {
    width: 1.5,
    flex: 1,
    backgroundColor: '#ffffff',
  },
  // BOTTOM TOOLS
  bottomToolsBar: {
    height: 80,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
  },
  toolsScroll: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  formatBadge: {
    width: 32,
    height: 50,
    backgroundColor: '#333333',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  formatBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: theme.spacing.md,
    minWidth: 50,
  },
  disabledToolBtn: {
    opacity: 0.3,
  },
  toolIcon: {
    fontSize: 22,
    color: '#ffffff',
    marginBottom: 4,
  },
  toolLabel: {
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
  editingPanelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  backToMainBtn: {
    width: 36,
    height: 36,
    backgroundColor: theme.colors.primary,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  backToMainArrow: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  transitionOption: {
    backgroundColor: theme.colors.surfaceLight,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 8,
    marginHorizontal: theme.spacing.xs,
    borderColor: theme.colors.primary,
    borderWidth: 1,
  },
  transitionOptionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  textModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  textModalContent: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 12,
  },
  textInput: {
    backgroundColor: '#333',
    color: '#FFF',
    fontSize: 18,
    padding: 15,
    borderRadius: 8,
  },
  exportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportModalContent: {
    width: '80%',
    alignItems: 'center',
  },
  exportTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  progressBarContainer: {
    width: '100%',
    height: 12,
    backgroundColor: '#333',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 15,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  exportProgressText: {
    color: theme.colors.primary,
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  exportSubText: {
    color: '#CCC',
    fontSize: 14,
    marginBottom: 5,
  },
  exportWarning: {
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
  },
  videoPlayerContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0F0F1A',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cameraGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    top: '50%',
  },
  cameraGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    left: '50%',
  },
  recBadgeRow: {
    position: 'absolute',
    top: theme.spacing.md,
    left: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#666',
    marginRight: 6,
  },
  recDotActive: {
    backgroundColor: '#EF4444',
  },
  recText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  centerPlayIconContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  centerPlayIcon: {
    color: '#FFF',
    fontSize: 20,
    marginLeft: 2,
  },
  videoBottomInfo: {
    position: 'absolute',
    bottom: theme.spacing.md,
    left: theme.spacing.md,
    right: theme.spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  videoInfoTitle: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 10,
  },
  videoTimecode: {
    color: theme.colors.primary,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  liveAudioBarsRow: {
    position: 'absolute',
    bottom: theme.spacing.md + 40,
    right: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 30,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 4,
    borderRadius: 4,
  },
  liveAudioBar: {
    width: 3,
    backgroundColor: theme.colors.primary,
    marginHorizontal: 1,
    borderRadius: 1.5,
  },
});

export default VideoEditorScreen;
