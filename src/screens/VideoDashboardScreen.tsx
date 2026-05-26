import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Animated, Dimensions, ScrollView, Alert, Image, ImageBackground } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
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
      <TouchableOpacity style={styles.actionButton} onPress={openDrawer}>
        <Text style={styles.actionButtonText}>+ Nouveau Projet</Text>
      </TouchableOpacity>

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
              <TouchableOpacity onPress={handleCreateProject} style={styles.createButton}>
                <Text style={styles.createButtonText}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.xl + 10,
    marginBottom: theme.spacing.lg,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: 'bold',
  },
  proButton: {
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
  },
  proButtonText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  illustrationContainer: {
    width: 200,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  monitorFrame: {
    width: 140,
    height: 90,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.surfaceLight,
    borderWidth: 3,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  innerScreen: {
    width: '90%',
    height: '85%',
    backgroundColor: '#000000',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: theme.colors.primary,
    fontSize: 24,
  },
  tripodLine1: {
    width: 3,
    height: 50,
    backgroundColor: theme.colors.surfaceLight,
    transform: [{ rotate: '-25deg' }],
    position: 'absolute',
    bottom: 30,
    left: 80,
  },
  tripodLine2: {
    width: 3,
    height: 50,
    backgroundColor: theme.colors.surfaceLight,
    transform: [{ rotate: '25deg' }],
    position: 'absolute',
    bottom: 30,
    right: 80,
  },
  centerPlusButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 25,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },
  centerPlusText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  actionButtonText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Style Drawer (Tiroir)
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    flex: 1,
  },
  drawerContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  drawerHandle: {
    width: 40,
    height: 5,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 3,
    marginBottom: theme.spacing.md,
  },
  drawerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: theme.spacing.lg,
  },
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingBottom: theme.spacing.lg,
  },
  card: {
    flex: 0.48,
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
  },
  cardIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  cardIcon: {
    fontSize: 24,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  cardDescription: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  // Modal Style
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.surfaceLight,
    color: theme.colors.text,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: theme.spacing.sm,
    marginRight: theme.spacing.sm,
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
  },
  createButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
  },
  createButtonText: {
    color: theme.colors.text,
    fontWeight: 'bold',
  },
  fieldLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
  },
  formatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  formatCard: {
    width: '48%',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  formatCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
  },
  formatCardText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: theme.spacing.xs,
  },
  formatCardSub: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  ratioVisualBase: {
    borderColor: '#555555',
    borderWidth: 1.5,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  ratioVisualActive: {
    borderColor: theme.colors.primary,
  },
  ratioTikTok: {
    width: 16,
    height: 28,
  },
  ratioYouTube: {
    width: 28,
    height: 16,
    marginVertical: 6,
  },
  ratioInstagram: {
    width: 22,
    height: 22,
    marginVertical: 3,
  },
  ratioRetro: {
    width: 24,
    height: 18,
    marginVertical: 5,
  },
  projectsList: {
    flex: 1,
    paddingTop: theme.spacing.sm,
  },
  listSectionTitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
  },
  projectCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 80,
  },
  projectCard: {
    width: '48%',
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 12,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222222',
  },
  projectCardThumbnail: {
    width: '100%',
    height: 110,
    justifyContent: 'flex-end',
  },
  projectCardOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6,
    alignItems: 'flex-start',
  },
  projectCardFormatLabel: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  projectCardPlaceholder: {
    width: '100%',
    height: 110,
    backgroundColor: '#151515',
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectPlaceholderIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  projectCardDetails: {
    padding: 8,
  },
  projectCardName: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: 'bold',
  },
  projectCardDate: {
    color: '#666666',
    fontSize: 10,
    marginTop: 4,
  },
});

export default VideoDashboardScreen;
