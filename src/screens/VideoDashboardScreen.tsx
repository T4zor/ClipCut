import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Animated, Dimensions, ScrollView, Alert, Image, ImageBackground } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
import AnimatedNeonButton from '../components/AnimatedNeonButton';
import { styles } from './VideoDashboardScreen.styles';
import { StorageService, Project } from '../services/StorageService';

const { height } = Dimensions.get('window');

const VideoDashboardScreen = () => {
  const navigation = useNavigation<any>();
  
  // États
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('9:16');
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  
  // Animation du tiroir (Bottom Sheet)
  const [slideAnim] = useState(new Animated.Value(height));

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [])
  );

  const loadProjects = async () => {
    const projects = await StorageService.getProjects();
    setSavedProjects(projects);
  };

  const openDrawer = () => {
    setDrawerVisible(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(slideAnim, {
      toValue: height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setDrawerVisible(false));
  };

  const handleImportClick = () => {
    closeDrawer();
    setModalVisible(true);
  };

  const handleCreateProject = async () => {
    if (projectName.trim() !== '') {
      const newProject: Project = {
        id: Date.now().toString(),
        name: projectName.trim(),
        format: selectedFormat,
        clips: [],
        lastModified: Date.now()
      };
      
      await StorageService.saveProject(newProject);
      
      setModalVisible(false);
      navigation.navigate('VideoEditor', { projectId: newProject.id });
      setProjectName('');
      setSelectedFormat('9:16');
    } else {
      Alert.alert("Nom de projet manquant", "Veuillez entrer un nom pour votre nouveau projet afin de le créer.");
    }
  };

  const handleDeleteProject = (id: string) => {
    Alert.alert("Supprimer", "Voulez-vous vraiment supprimer ce projet ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => {
          await StorageService.deleteProject(id);
          loadProjects();
      }}
    ]);
  };

  const formats = [
    { id: '9:16', label: '9:16', sub: 'TikTok / Reel', style: styles.ratioTikTok },
    { id: '16:9', label: '16:9', sub: 'YouTube / TV', style: styles.ratioYouTube },
    { id: '1:1', label: '1:1', sub: 'Instagram', style: styles.ratioInstagram },
    { id: '4:3', label: '4:3', sub: 'iPad / Retro', style: styles.ratioRetro },
  ];

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Projets</Text>
        <TouchableOpacity style={styles.proButton}>
          <Text style={styles.proButtonText}>GET PRO</Text>
        </TouchableOpacity>
      </View>

      {/* Liste des projets ou État vide */}
      {savedProjects.length > 0 ? (
        <ScrollView style={styles.projectsList} showsVerticalScrollIndicator={false}>
          <Text style={styles.listSectionTitle}>Projets récents</Text>
          <View style={styles.projectCardsGrid}>
            {savedProjects.map(project => {
              const firstClip = project.clips && project.clips.length > 0 ? project.clips[0] : null;
              return (
                <TouchableOpacity 
                  key={project.id} 
                  style={styles.projectCard}
                  onPress={() => navigation.navigate('VideoEditor', { projectId: project.id })}
                  onLongPress={() => handleDeleteProject(project.id)}
                >
                  {firstClip ? (
                    <ImageBackground 
                      source={{ uri: firstClip.uri }} 
                      style={styles.projectCardThumbnail}
                      imageStyle={{ borderRadius: 12 }}
                    >
                      <View style={styles.projectCardOverlay}>
                        <Text style={styles.projectCardFormatLabel}>{project.format}</Text>
                      </View>
                    </ImageBackground>
                  ) : (
                    <View style={styles.projectCardPlaceholder}>
                      <Text style={styles.projectPlaceholderIcon}>🎬</Text>
                      <Text style={styles.projectCardFormatLabel}>{project.format}</Text>
                    </View>
                  )}
                  <View style={styles.projectCardDetails}>
                    <Text style={styles.projectCardName} numberOfLines={1}>{project.name}</Text>
                    <Text style={styles.projectCardDate}>
                      {new Date(project.lastModified).toLocaleDateString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyStateContainer}>
          <View style={styles.illustrationContainer}>
            <View style={styles.monitorFrame}>
              <View style={styles.innerScreen}>
                <Text style={styles.playIcon}>▶</Text>
              </View>
            </View>
            <View style={styles.tripodLine1} />
            <View style={styles.tripodLine2} />
            <TouchableOpacity style={styles.centerPlusButton} onPress={openDrawer}>
              <Text style={styles.centerPlusText}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.emptyTitle}>Aucun projet pour le moment</Text>
          <Text style={styles.emptySubtitle}>
            Appuyez sur le bouton ci-dessous pour ajouter votre premier projet.
          </Text>
        </View>
      )}

      {/* Gros bouton d'action en bas */}
      <AnimatedNeonButton style={styles.actionButton} onPress={openDrawer}>
        <Text style={styles.actionButtonText}>+ Nouveau Projet</Text>
      </AnimatedNeonButton>

      {/* TIROIR (Bottom Sheet) "Que voulez-vous faire aujourd'hui ?" */}
      <Modal visible={drawerVisible} transparent={true} animationType="none" onRequestClose={closeDrawer}>
        <View style={styles.drawerOverlay}>
          <TouchableOpacity style={styles.dismissOverlay} onPress={closeDrawer} />
          <Animated.View style={[styles.drawerContent, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Que voulez-vous faire aujourd'hui ?</Text>
            
            <View style={styles.cardsRow}>
              {/* Option 1: Importer */}
              <TouchableOpacity style={styles.card} onPress={handleImportClick}>
                <View style={styles.cardIconContainer}>
                  <Text style={styles.cardIcon}>📥</Text>
                </View>
                <Text style={styles.cardTitle}>Importer</Text>
                <Text style={styles.cardDescription}>Ajouter vos vidéos</Text>
              </TouchableOpacity>

              {/* Option 2: Caméra */}
              <TouchableOpacity style={styles.card} onPress={closeDrawer}>
                <View style={styles.cardIconContainer}>
                  <Text style={styles.cardIcon}>📷</Text>
                </View>
                <Text style={styles.cardTitle}>Caméra</Text>
                <Text style={styles.cardDescription}>Filmer en direct</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* MODAL pour nommer le projet & choisir le format */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nouveau projet</Text>
            
            <Text style={styles.fieldLabel}>Nom du projet</Text>
            <TextInput
              style={styles.input}
              placeholder="Mon chef d'œuvre"
              placeholderTextColor={theme.colors.textSecondary}
              value={projectName}
              onChangeText={setProjectName}
              autoFocus
            />

            <Text style={styles.fieldLabel}>Format de la vidéo</Text>
            <View style={styles.formatsGrid}>
              {formats.map((fmt) => (
                <TouchableOpacity 
                  key={fmt.id} 
                  style={[
                    styles.formatCard, 
                    selectedFormat === fmt.id && styles.formatCardActive
                  ]}
                  onPress={() => setSelectedFormat(fmt.id)}
                >
                  <View style={[styles.ratioVisualBase, fmt.style, selectedFormat === fmt.id && styles.ratioVisualActive]} />
                  <Text style={styles.formatCardText}>{fmt.label}</Text>
                  <Text style={styles.formatCardSub}>{fmt.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <AnimatedNeonButton onPress={handleCreateProject} style={styles.createButton}>
                <Text style={styles.createButtonText}>Créer</Text>
              </AnimatedNeonButton>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default VideoDashboardScreen;
