import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Editor from "@monaco-editor/react";
import { 
  Folder, 
  FolderOpen,
  File, 
  FileText, 
  Code, 
  Plus, 
  Edit, 
  Trash2, 
  Save,
  RefreshCw,
  Search,
  FolderPlus,
  FileCode,
  FileImage,
  FileJson,
  FileCog,
  ChevronRight,
  ChevronDown,
  Wand2,
  Upload,
  Edit2
} from "lucide-react";

interface GitFile {
  id: string;
  file_path: string;
  file_content: string;
  file_type: string;
  last_modified: string;
}

interface FolderNode {
  name: string;
  path: string;
  children: { [key: string]: FolderNode };
  files: GitFile[];
  isExpanded: boolean;
}

interface FileBrowserProps {
  projectId: string;
}

const FileBrowser: React.FC<FileBrowserProps> = ({ projectId }) => {
  const { toast } = useToast();
  const [files, setFiles] = useState<GitFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<GitFile | null>(null);
  const [editingFile, setEditingFile] = useState<GitFile | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showSyncConfirmDialog, setShowSyncConfirmDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [renameFilePath, setRenameFilePath] = useState("");
  const [fileToRename, setFileToRename] = useState<GitFile | null>(null);
  const [folderTree, setFolderTree] = useState<FolderNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // Custom automation generator states
  const [showAutomationDialog, setShowAutomationDialog] = useState(false);
  const [automationInputs, setAutomationInputs] = useState({
    userStoryName: '',
    htmlDom: '',
    mockupFiles: [] as File[],
    stepsInNaturalLanguage: '',
    programmingLanguage: 'java'
  });
  const [isGeneratingAutomation, setIsGeneratingAutomation] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, [projectId]);

  const fetchFiles = async () => {
    try {
      const { data, error } = await supabase
        .from("git_files")
        .select("*")
        .eq("project_id", projectId)
        .order("file_path");

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error("Error fetching files:", error);
      toast({
        title: "Error",
        description: "Failed to load repository files",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateCustomAutomation = async () => {
    if (!automationInputs.stepsInNaturalLanguage.trim()) {
      toast({
        title: "Missing Required Field",
        description: "Steps in Natural Language is required",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingAutomation(true);
    try {
      if (automationInputs.programmingLanguage === 'java') {
        // Use the specialized Java automation generator
        await generateJavaAutomationFiles();
      } else {
        // Use the generic automation generator for other languages
        await generateGenericAutomationScript();
      }
    } catch (error) {
      console.error('Error generating automation:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate automation script",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAutomation(false);
    }
  };

  const generateJavaAutomationFiles = async () => {
    // Create test case structure for Java automation generator
    const testCase = {
      id: `tc-${Date.now()}`,
      title: automationInputs.userStoryName || 'Custom Test Case',
      description: `Test case for ${automationInputs.userStoryName || 'custom functionality'}`,
      steps: automationInputs.stepsInNaturalLanguage.split('\n').filter(step => step.trim()),
      expectedResult: 'Test should complete successfully',
      priority: 'High',
      status: 'Draft',
      userStoryId: `us-${Date.now()}`,
      userStoryTitle: automationInputs.userStoryName || 'Custom User Story',
      projectId: projectId
    };

    // Get project name for package structure
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();

    if (projectError) throw projectError;
    
    const projectName = projectData?.name || 'TestProject';

    const requestBody = {
      testCase,
      projectName,
      projectId,
      saveToRepository: true,
      htmlDom: automationInputs.htmlDom || null
    };

    const { data, error } = await supabase.functions.invoke('generate-java-automation-files', {
      body: JSON.stringify(requestBody),
    });

    if (error) throw error;

    if (data.success) {
      toast({
        title: "Success",
        description: "Java automation files generated with proper structure (Page Object, Steps, Tests)",
      });
      
      setShowAutomationDialog(false);
      setAutomationInputs({
        userStoryName: '',
        htmlDom: '',
        mockupFiles: [],
        stepsInNaturalLanguage: '',
        programmingLanguage: 'java'
      });
      
      // Refresh files to show the new automation files
      fetchFiles();
    } else {
      throw new Error(data.error || 'Failed to generate Java automation files');
    }
  };

  const generateGenericAutomationScript = async () => {
    const formData = new FormData();
    
    // Required field
    formData.append('stepsInNaturalLanguage', automationInputs.stepsInNaturalLanguage);
    formData.append('programmingLanguage', automationInputs.programmingLanguage);
    formData.append('projectId', projectId);
    
    // Optional fields
    if (automationInputs.userStoryName.trim()) {
      formData.append('userStoryName', automationInputs.userStoryName);
    }
    if (automationInputs.htmlDom.trim()) {
      formData.append('htmlDom', automationInputs.htmlDom);
    }
    
    // Add mockup files
    automationInputs.mockupFiles.forEach((file, index) => {
      formData.append(`mockupFile${index}`, file);
    });

    // Add project ID to the form data
    formData.append('projectId', projectId);

    const { data, error } = await supabase.functions.invoke('automation-generator', {
      body: formData,
    });

    if (error) throw error;

    if (data.success && data.generatedCode) {
      // Create automation files in the repository
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const basePath = `automation/${automationInputs.userStoryName || 'custom'}-${timestamp}`;
      
      // Create main automation file
      await createAutomationFile(`${basePath}/AutomationScript.${getFileExtension(automationInputs.programmingLanguage)}`, data.generatedCode);
      
      toast({
        title: "Success",
        description: "Automation script generated successfully",
      });
      
      setShowAutomationDialog(false);
      setAutomationInputs({
        userStoryName: '',
        htmlDom: '',
        mockupFiles: [],
        stepsInNaturalLanguage: '',
        programmingLanguage: 'java'
      });
      
      // Refresh files to show the new automation script
      fetchFiles();
    } else {
      throw new Error(data.error || 'Failed to generate automation script');
    }
  };

  const createAutomationFile = async (filePath: string, content: string) => {
    try {
      const { error } = await supabase
        .from("git_files")
        .insert({
          project_id: projectId,
          file_path: filePath,
          file_content: content,
          file_type: getFileType(filePath),
        });

      if (error) throw error;
    } catch (error) {
      console.error("Error creating automation file:", error);
      throw error;
    }
  };

  const getFileExtension = (language: string): string => {
    switch (language.toLowerCase()) {
      case 'java':
        return 'java';
      case 'python':
        return 'py';
      case 'javascript':
        return 'js';
      case 'csharp':
        return 'cs';
      default:
        return 'txt';
    }
  };

  const syncWithRepository = async () => {
    setLoading(true);
    setShowSyncConfirmDialog(false);
    try {
      const { error } = await supabase.functions.invoke("github-sync", {
        body: { projectId },
      });

      if (error) throw error;
      await fetchFiles();
      toast({
        title: "Success",
        description: "Repository synced successfully",
      });
    } catch (error: any) {
      console.error("Error syncing repository:", error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync repository",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createFile = async () => {
    if (!newFilePath.trim()) {
      toast({
        title: "Error",
        description: "Please enter a file path",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("git_files")
        .insert({
          project_id: projectId,
          file_path: newFilePath,
          file_content: newFileContent,
          file_type: getFileType(newFilePath),
          last_modified: new Date().toISOString(),
        });

      if (error) throw error;

      setNewFilePath("");
      setNewFileContent("");
      setShowNewFileDialog(false);
      await fetchFiles();

      toast({
        title: "Success",
        description: "File created successfully",
      });
    } catch (error: any) {
      console.error("Error creating file:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create file",
        variant: "destructive",
      });
    }
  };

  const saveFile = async () => {
    if (!editingFile) return;
    
    try {
      console.log('Saving file:', editingFile.file_path, 'with content length:', editingFile.file_content.length);
      
      const { error } = await supabase
        .from("git_files")
        .update({
          file_content: editingFile.file_content,
          last_modified: new Date().toISOString(),
        })
        .eq("id", editingFile.id);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      // Update the selected file with the new content
      setSelectedFile(editingFile);
      setEditingFile(null);
      await fetchFiles();

      toast({
        title: "Success",
        description: "File saved successfully",
      });
    } catch (error: any) {
      console.error("Error saving file:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save file",
        variant: "destructive",
      });
    }
  };

  const deleteFile = async (fileId: string) => {
    try {
      const { error } = await supabase
        .from("git_files")
        .delete()
        .eq("id", fileId);

      if (error) throw error;

      setSelectedFile(null);
      setEditingFile(null);
      await fetchFiles();

      toast({
        title: "Success",
        description: "File deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting file:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete file",
        variant: "destructive",
      });
    }
  };

  const openRenameDialog = (file: GitFile) => {
    setFileToRename(file);
    setRenameFilePath(file.file_path);
    setShowRenameDialog(true);
  };

  const renameFile = async () => {
    if (!fileToRename || !renameFilePath.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid file path",
        variant: "destructive",
      });
      return;
    }

    if (renameFilePath === fileToRename.file_path) {
      setShowRenameDialog(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("git_files")
        .update({
          file_path: renameFilePath,
          last_modified: new Date().toISOString(),
        })
        .eq("id", fileToRename.id);

      if (error) throw error;

      setShowRenameDialog(false);
      setFileToRename(null);
      setRenameFilePath("");
      
      // Update selected file if it's the one being renamed
      if (selectedFile?.id === fileToRename.id) {
        setSelectedFile({ ...fileToRename, file_path: renameFilePath });
      }
      
      await fetchFiles();

      toast({
        title: "Success",
        description: "File renamed successfully",
      });
    } catch (error: any) {
      console.error("Error renaming file:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to rename file",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (filePath: string) => {
    const extension = filePath.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'java':
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
      case 'py':
      case 'cs':
      case 'cpp':
      case 'c':
      case 'go':
      case 'rs':
      case 'php':
      case 'rb':
        return <FileCode className="w-4 h-4 text-blue-500" />;
      case 'json':
      case 'xml':
      case 'yml':
      case 'yaml':
        return <FileJson className="w-4 h-4 text-yellow-500" />;
      case 'md':
      case 'txt':
      case 'readme':
        return <FileText className="w-4 h-4 text-gray-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
      case 'webp':
        return <FileImage className="w-4 h-4 text-green-500" />;
      case 'properties':
      case 'config':
      case 'ini':
      case 'conf':
        return <FileCog className="w-4 h-4 text-purple-500" />;
      default:
        return <File className="w-4 h-4 text-gray-400" />;
    }
  };

  const getFileType = (filePath: string) => {
    const extension = filePath.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'java': return 'java';
      case 'js': return 'javascript';
      case 'jsx': return 'javascript';
      case 'ts': return 'typescript';
      case 'tsx': return 'typescript';
      case 'py': return 'python';
      case 'cs': return 'csharp';
      case 'cpp': return 'cpp';
      case 'c': return 'c';
      case 'go': return 'go';
      case 'rs': return 'rust';
      case 'php': return 'php';
      case 'rb': return 'ruby';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'scss': return 'scss';
      case 'less': return 'less';
      case 'json': return 'json';
      case 'xml': return 'xml';
      case 'yml':
      case 'yaml': return 'yaml';
      case 'md': return 'markdown';
      case 'sql': return 'sql';
      case 'sh': return 'shell';
      case 'bat': return 'bat';
      case 'dockerfile': return 'dockerfile';
      case 'properties': return 'properties';
      default: return 'plaintext';
    }
  };

  const getMonacoLanguage = (filePath: string) => {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const fileName = filePath.split('/').pop()?.toLowerCase();
    
    if (fileName === 'dockerfile') return 'dockerfile';
    
    switch (extension) {
      case 'java': return 'java';
      case 'js': return 'javascript';
      case 'jsx': return 'javascript';
      case 'ts': return 'typescript';
      case 'tsx': return 'typescript';
      case 'py': return 'python';
      case 'cs': return 'csharp';
      case 'cpp': return 'cpp';
      case 'c': return 'c';
      case 'go': return 'go';
      case 'rs': return 'rust';
      case 'php': return 'php';
      case 'rb': return 'ruby';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'scss': return 'scss';
      case 'less': return 'less';
      case 'json': return 'json';
      case 'xml': return 'xml';
      case 'yml':
      case 'yaml': return 'yaml';
      case 'md': return 'markdown';
      case 'sql': return 'sql';
      case 'sh': return 'shell';
      case 'bat': return 'bat';
      case 'dockerfile': return 'dockerfile';
      case 'properties': return 'properties';
      default: return 'plaintext';
    }
  };

  const filteredFiles = files.filter(file =>
    file.file_path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const buildFolderTree = (files: GitFile[]): FolderNode => {
    const root: FolderNode = {
      name: 'root',
      path: '',
      children: {},
      files: [],
      isExpanded: true
    };

    files.forEach(file => {
      const pathParts = file.file_path.split('/');
      let currentNode = root;

      // Navigate through folders
      for (let i = 0; i < pathParts.length - 1; i++) {
        const folderName = pathParts[i];
        const folderPath = pathParts.slice(0, i + 1).join('/');

        if (!currentNode.children[folderName]) {
          currentNode.children[folderName] = {
            name: folderName,
            path: folderPath,
            children: {},
            files: [],
            isExpanded: expandedFolders.has(folderPath)
          };
        }
        currentNode = currentNode.children[folderName];
      }

      // Add file to the current folder
      if (pathParts.length === 1) {
        root.files.push(file);
      } else {
        currentNode.files.push(file);
      }
    });

    return root;
  };

  const toggleFolder = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const renderFolderTree = (node: FolderNode, depth: number = 0) => {
    const items: React.ReactNode[] = [];

    // Render folders (excluding those starting with .)
    Object.entries(node.children)
      .filter(([folderName]) => !folderName.startsWith('.'))
      .map(([folderName, folderNode]) => {
      const isExpanded = expandedFolders.has(folderNode.path);
      items.push(
        <div key={folderNode.path}>
          <div
            className="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-accent text-sm"
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
            onClick={() => toggleFolder(folderNode.path)}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-blue-500" />
            ) : (
              <Folder className="w-4 h-4 text-blue-500" />
            )}
            <span className="font-medium">{folderName}</span>
          </div>
          {isExpanded && renderFolderTree(folderNode, depth + 1)}
        </div>
      );
    });

    // Render files in current folder
    node.files.forEach(file => {
      const fileName = file.file_path.split('/').pop() || file.file_path;
      items.push(
        <div
          key={file.id}
          className={`flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-accent text-sm ${
            selectedFile?.id === file.id ? 'bg-accent' : ''
          }`}
          style={{ paddingLeft: `${depth * 12 + 26}px` }}
          onClick={() => setSelectedFile(file)}
        >
          {getFileIcon(file.file_path)}
          <span className="truncate">{fileName}</span>
        </div>
      );
    });

    return items;
  };

  const tree = buildFolderTree(filteredFiles);

  return (
    <div className="h-[800px]">
      <ResizablePanelGroup direction="horizontal" className="rounded-lg border">
        {/* File Explorer Panel */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <Card className="h-full border-0 rounded-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Folder className="w-5 h-5" />
                  Files
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setShowSyncConfirmDialog(true)} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Dialog open={showAutomationDialog} onOpenChange={setShowAutomationDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="ghost" title="Generate Custom Automation Script">
                        <Wand2 className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Generate Custom Automation Script</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="userStoryName">User Story/Functionality Name (Optional)</Label>
                            <Input
                              id="userStoryName"
                              placeholder="e.g., Login functionality"
                              value={automationInputs.userStoryName}
                              onChange={(e) => setAutomationInputs(prev => ({ ...prev, userStoryName: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="programmingLanguage">Programming Language</Label>
                            <Select 
                              value={automationInputs.programmingLanguage} 
                              onValueChange={(value) => setAutomationInputs(prev => ({ ...prev, programmingLanguage: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="java">Java</SelectItem>
                                <SelectItem value="python">Python</SelectItem>
                                <SelectItem value="javascript">JavaScript</SelectItem>
                                <SelectItem value="csharp">C#</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="htmlDom">HTML DOM (Optional)</Label>
                          <Textarea
                            id="htmlDom"
                            placeholder="Paste your HTML DOM structure here..."
                            value={automationInputs.htmlDom}
                            onChange={(e) => setAutomationInputs(prev => ({ ...prev, htmlDom: e.target.value }))}
                            className="min-h-[120px] font-mono text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="mockupFiles">Mock-up Files (Optional)</Label>
                          <div className="border-2 border-dashed border-muted rounded-lg p-4">
                            <input
                              id="mockupFiles"
                              type="file"
                              multiple
                              accept="image/*,.pdf,.sketch,.fig"
                              onChange={(e) => {
                                const files = e.target.files;
                                if (files) {
                                  setAutomationInputs(prev => ({ ...prev, mockupFiles: Array.from(files) }));
                                }
                              }}
                              className="hidden"
                            />
                            <label htmlFor="mockupFiles" className="cursor-pointer flex flex-col items-center gap-2">
                              <Upload className="w-8 h-8 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                Click to upload mock-up files (images, PDFs, etc.)
                              </span>
                            </label>
                            {automationInputs.mockupFiles.length > 0 && (
                              <div className="mt-2 text-sm text-muted-foreground">
                                {automationInputs.mockupFiles.length} file(s) selected
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="stepsInNaturalLanguage">Steps in Natural Language (Required) *</Label>
                          <Textarea
                            id="stepsInNaturalLanguage"
                            placeholder="Describe the automation steps in natural language:&#10;1. Navigate to login page&#10;2. Enter username and password&#10;3. Click login button&#10;4. Verify successful login&#10;..."
                            value={automationInputs.stepsInNaturalLanguage}
                            onChange={(e) => setAutomationInputs(prev => ({ ...prev, stepsInNaturalLanguage: e.target.value }))}
                            className="min-h-[150px]"
                            required
                          />
                        </div>

                        <div className="flex gap-2">
                          <Button 
                            onClick={generateCustomAutomation} 
                            disabled={isGeneratingAutomation || !automationInputs.stepsInNaturalLanguage.trim()}
                          >
                            {isGeneratingAutomation ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Wand2 className="w-4 h-4 mr-2" />
                                Generate Automation Script
                              </>
                            )}
                          </Button>
                          <Button variant="outline" onClick={() => setShowAutomationDialog(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={showNewFileDialog} onOpenChange={setShowNewFileDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Create New File</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Input
                          placeholder="File path (e.g., src/test/ExampleTest.java)"
                          value={newFilePath}
                          onChange={(e) => setNewFilePath(e.target.value)}
                        />
                        <div className="h-[300px] border rounded-md">
                          <Editor
                            value={newFileContent}
                            onChange={(value) => setNewFileContent(value || "")}
                            language={getMonacoLanguage(newFilePath)}
                            theme="vs-dark"
                            options={{
                              minimap: { enabled: false },
                              fontSize: 14,
                              wordWrap: "on",
                              automaticLayout: true,
                            }}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={createFile}>Create File</Button>
                          <Button variant="outline" onClick={() => setShowNewFileDialog(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-8"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              <ScrollArea className="h-[calc(800px-120px)]">
                <div className="space-y-1 p-3 pt-0">
                  {filteredFiles.length === 0 && !loading ? (
                    <p className="text-center text-muted-foreground py-8 text-sm">
                      No files found. Sync your repository or create a new file.
                    </p>
                  ) : (
                    renderFolderTree(tree)
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Code Editor Panel */}
        <ResizablePanel defaultSize={70} minSize={40}>
          <Card className="h-full border-0 rounded-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  {selectedFile ? (
                    <>
                      {getFileIcon(selectedFile.file_path)}
                      {selectedFile.file_path}
                    </>
                  ) : (
                    "Select a file"
                  )}
                </CardTitle>
                {selectedFile && (
                  <div className="flex items-center gap-2">
                    {editingFile?.id === selectedFile.id ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => saveFile()}
                          className="h-8"
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setEditingFile(null)}
                          className="h-8"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingFile(selectedFile)}
                          className="h-8"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRenameDialog(selectedFile)}
                          className="h-8"
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteFile(selectedFile.id)}
                          className="h-8"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 h-[calc(100%-80px)]">
                {selectedFile ? (
                <div className="h-full">
                  {editingFile?.id === selectedFile.id ? (
                    <Editor
                      key={`edit-${selectedFile.id}`}
                      value={editingFile.file_content}
                      onChange={(value) =>
                        setEditingFile({ ...editingFile, file_content: value || "" })
                      }
                      language={getMonacoLanguage(selectedFile.file_path)}
                      theme="vs-dark"
                      options={{
                        readOnly: false,
                        minimap: { enabled: true },
                        fontSize: 14,
                        wordWrap: "on",
                        automaticLayout: true,
                        scrollBeyondLastLine: false,
                        renderLineHighlight: "all",
                        selectOnLineNumbers: true,
                        matchBrackets: "always",
                        folding: true,
                        foldingStrategy: "indentation",
                        showFoldingControls: "always",
                        lineNumbers: "on",
                        glyphMargin: true,
                        contextmenu: true,
                        mouseWheelZoom: true,
                        quickSuggestions: {
                          other: true,
                          comments: false,
                          strings: false
                        },
                        parameterHints: {
                          enabled: true
                        },
                        suggestOnTriggerCharacters: true,
                        acceptSuggestionOnEnter: "on",
                        tabCompletion: "on",
                      }}
                    />
                  ) : (
                    <Editor
                      key={`view-${selectedFile.id}`}
                      value={selectedFile.file_content || "// Empty file"}
                      language={getMonacoLanguage(selectedFile.file_path)}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: true },
                        fontSize: 14,
                        wordWrap: "on",
                        automaticLayout: true,
                        scrollBeyondLastLine: false,
                        renderLineHighlight: "all",
                        selectOnLineNumbers: true,
                        lineNumbers: "on",
                        glyphMargin: true,
                        contextmenu: false,
                        mouseWheelZoom: true,
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <FileCode className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No file selected</p>
                    <p className="text-sm">Choose a file from the explorer to view or edit its content</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>

      <AlertDialog open={showSyncConfirmDialog} onOpenChange={setShowSyncConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync Repository</AlertDialogTitle>
            <AlertDialogDescription>
              Your recent changes will be removed. Make sure your changes are pushed to the repository before syncing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={syncWithRepository}>Continue Sync</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename File Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="renameFilePath">File Path</Label>
              <Input
                id="renameFilePath"
                placeholder="Enter new file path"
                value={renameFilePath}
                onChange={(e) => setRenameFilePath(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={renameFile}>Rename</Button>
              <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FileBrowser;