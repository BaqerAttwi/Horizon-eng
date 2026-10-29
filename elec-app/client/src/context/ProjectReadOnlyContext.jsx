import { createContext, useContext } from 'react';

export const ProjectReadOnlyContext = createContext(false);
export const useProjectReadOnly = () => useContext(ProjectReadOnlyContext);
