// MOCK EN MÉMOIRE (Fallback car npm n'a pas pu télécharger async-storage)
// En production connectée, ceci serait remplacé par : import AsyncStorage from '@react-native-async-storage/async-storage';

export type Keyframe = {
  time: number; // en secondes
  scale: number;
  opacity: number;
  rotation: number;
  x: number;
  y: number;
};

export type TextOverlay = {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  scale?: number;
  opacity?: number;
  rotation?: number;
};

export type Clip = {
  id: string;
  uri: string;
  type: 'video' | 'image';
  fileName: string;
  transition: string;
  duration: number; // en secondes
  textOverlays: TextOverlay[];
  keyframes?: Keyframe[];
  scale?: number;
  opacity?: number;
  rotation?: number;
  x?: number;
  y?: number;
  speed?: number; // Vitesse de lecture
  channel?: number; // Piste/Canal (0 = Piste principale, 1 = Piste superposition)
  startOffset?: number; // Position de début sur la timeline (en secondes)
};

export type AudioClip = {
  id: string;
  name: string;
  uri: string;
  duration: number;
  startOffset: number; // décalage dans le projet (en secondes)
};

export type Project = {
  id: string;
  name: string;
  format: string;
  clips: Clip[];
  audioClips?: AudioClip[];
  lastModified: number;
};

// Variable en mémoire pour stocker les projets tant que l'app est ouverte
let memoryStorage: Record<string, string> = {};
const PROJECTS_KEY = '@clipcut_projects';

export const StorageService = {
  /**
   * Récupère la liste de tous les projets sauvegardés
   */
  async getProjects(): Promise<Project[]> {
    try {
      const jsonValue = memoryStorage[PROJECTS_KEY];
      return jsonValue != null ? JSON.parse(jsonValue) : [];
    } catch (e) {
      console.error('Erreur lors de la récupération des projets', e);
      return [];
    }
  },

  /**
   * Sauvegarde un projet complet (ou le met à jour si l'ID existe)
   */
  async saveProject(project: Project): Promise<void> {
    try {
      const projects = await this.getProjects();
      const existingIndex = projects.findIndex(p => p.id === project.id);
      
      project.lastModified = Date.now();

      if (existingIndex >= 0) {
        projects[existingIndex] = project;
      } else {
        projects.unshift(project); // Ajoute en premier (plus récent)
      }

      memoryStorage[PROJECTS_KEY] = JSON.stringify(projects);
    } catch (e) {
      console.error('Erreur lors de la sauvegarde du projet', e);
    }
  },

  /**
   * Récupère un projet spécifique par son ID
   */
  async getProjectById(id: string): Promise<Project | null> {
    try {
      const projects = await this.getProjects();
      return projects.find(p => p.id === id) || null;
    } catch (e) {
      console.error('Erreur lors de la récupération du projet', e);
      return null;
    }
  },

  /**
   * Supprime un projet de la mémoire
   */
  async deleteProject(id: string): Promise<void> {
    try {
      const projects = await this.getProjects();
      const filtered = projects.filter(p => p.id !== id);
      memoryStorage[PROJECTS_KEY] = JSON.stringify(filtered);
    } catch (e) {
      console.error('Erreur lors de la suppression du projet', e);
    }
  }
};


