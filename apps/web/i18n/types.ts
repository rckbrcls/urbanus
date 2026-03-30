export type Locale = 'pt-BR' | 'en';

export interface Dictionary {
  common: {
    save: string;
    saving: string;
    cancel: string;
    delete: string;
    map: string;
    projects: string;
    toggleTheme: string;
    back: string;
    retry: string;
    loading: string;
    loadingMap: string;
    export: string;
    process: string;
    processing: string;
    processed: string;
    language: string;
  };
  landing: {
    tagline: string;
    startDesigning: string;
    howItWorks: string;
    features: string;
    steps: {
      drawArea: { title: string; description: string };
      autoProcess: { title: string; description: string };
      editExport: { title: string; description: string };
    };
    featureCards: {
      pipeline: { title: string; description: string };
      nbr: { title: string; description: string };
      openData: { title: string; description: string };
      interactiveEditing: { title: string; description: string };
    };
    step: string;
  };
  projects: {
    title: string;
    subtitle: string;
    newProject: string;
    noProjectsTitle: string;
    noProjectsDescription: string;
    goToMap: string;
    streets: string;
  };
  editor: {
    modes: {
      select: string;
      move: string;
      addNode: string;
      delete: string;
      split: string;
    };
    loadingProject: string;
    initializing: string;
    projectNotFound: string;
    backToProjects: string;
    nodes: string;
    selected: string;
    deleteConfirmTitle: string;
    deleteConfirmDescription: string;
    overview: string;
    streetsTab: string;
    pipelineTab: string;
    projectStats: string;
    streets: string;
    elevation: string;
    centerCoordinates: string;
    selectedNodes: string;
    unnamed: string;
    more: string;
    clearSelection: string;
    highwayLegend: string;
    pipelineIdle: string;
    pipelineProcessing: string;
    pipelineError: string;
    pipelineRetry: string;
    exportGeoJSON: string;
    deleteProject: string;
    runPipeline: string;
    elevationView: string;
  };
  pipeline: {
    networkSummary: string;
    nodes: string;
    segments: string;
    length: string;
    pumpStations: string;
    totalCost: string;
    unreachable: string;
    nodeTypes: string;
    accessories: string;
    diameters: string;
  };
  mapPage: {
    shiftDragInstruction: string;
    cropToArea: string;
    area: string;
    crop: string;
    fetchData: string;
    saveProject: string;
    nameYourProject: string;
    projectPlaceholder: string;
    nodesPreview: string;
    editInProjectPage: string;
    streetsFailed: string;
    topographyFailed: string;
    nodesFailed: string;
  };
}
