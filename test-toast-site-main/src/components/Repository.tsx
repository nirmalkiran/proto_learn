import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import FileBrowser from "@/components/FileBrowser";
import GitHistory from "@/components/GitHistory";
import { ExecutionResult } from "@/components/ExecutionResult";
import { FileText, GitBranch, PlayCircle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import JSZip from "jszip";

interface RepositoryProps {
  projectId: string;
}

interface GitConfig {
  git_repository_url?: string;
  git_branch?: string;
  git_sync_status?: string;
}

export const Repository: React.FC<RepositoryProps> = ({ projectId }) => {
  const [gitConfig, setGitConfig] = useState<GitConfig>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchGitConfig = async () => {
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("git_repository_url, git_branch, git_sync_status")
          .eq("id", projectId)
          .single();

        if (error) throw error;
        if (data) {
          setGitConfig(data);
        }
      } catch (error) {
        console.error("Error fetching git config:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGitConfig();
  }, [projectId]);


const downloadRepository = async (data: string, repoName: string, projectName: string) => {

    try {

      // Create timestamp for folder name

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      const folderName = `${projectName}_${timestamp}`;

      
      // Create new ZIP for the project files
      const finalZip = new JSZip();

      // Fetch latest files from the Files section (git_files table)
      console.log(`Fetching latest files for project: ${projectId}`);

      const { data: tempFiles, error: tempFilesError } = await supabase
        .from("git_files")
        .select("*")
        .eq("project_id", projectId)
        .order("last_modified", { ascending: false });







      if (tempFilesError) {
        console.error("Error fetching files:", tempFilesError);
        toast({
          title: "Error",
          description: `Failed to fetch files: ${tempFilesError.message}`,
          variant: "destructive"
        });
        throw tempFilesError;
      }

      if (!tempFiles || tempFiles.length === 0) {
        console.log("No files found in Files section");
        toast({
          title: "Warning",
          description: "No files found to download",
          variant: "destructive"
        });
        return;
      }

      console.log(`Found ${tempFiles.length} latest files from Files section`);

      // Add only the latest files from git_files table to the ZIP
      tempFiles.forEach(tempFile => {
        console.log(`Adding file: ${tempFile.file_path}`);
        finalZip.file(tempFile.file_path, tempFile.file_content || '');
      });

      toast({
        title: "Success",
        description: `Preparing ${tempFiles.length} files for download`
      });



      



      // Create simplified batch script that directly targets the extracted folder



      const batchScript = `@echo off



setlocal enabledelayedexpansion







echo ==========================



echo 🛠 Automation Test Runner  



echo ==========================



echo Project: ${projectName}



echo Folder: ${folderName}



echo ==========================







:: Set the project directory directly to Downloads folder



set "PROJECT_DIR=%USERPROFILE%\\Downloads\\${folderName}"



echo Project directory: %PROJECT_DIR%







:: Verify pom.xml exists in the project directory



if not exist "%PROJECT_DIR%\\pom.xml" (



    echo ❌ pom.xml not found in %PROJECT_DIR%



    echo Please make sure you have extracted the project ZIP file to your Downloads folder



    echo.



    echo Press any key to exit...



    pause >nul



    exit /b 1



)



echo ✅ Found pom.xml in project directory







echo.



echo Changing to project directory: %PROJECT_DIR%



cd /d "%PROJECT_DIR%"







echo.



echo Current working directory: %CD%



echo Contents of current directory:



dir /b







echo.



echo ==========================



echo 🚀 Running Maven Clean Test



echo ==========================



echo Command: mvn clean test



echo.







:: Run Maven tests with error handling



mvn clean test



set "EXIT_CODE=%ERRORLEVEL%"







echo.



echo Maven command completed with exit code: %EXIT_CODE%







:: Show detailed result



echo.



echo ==========================



if %EXIT_CODE%==0 (



    echo ✅ Test execution completed successfully!



    echo All tests passed without errors.



) else (



    echo ❌ Test execution failed with exit code %EXIT_CODE%



    echo.



    echo Common issues and solutions:



    echo - Check if all dependencies are available



    echo - Verify Java version compatibility  



    echo - Check test configuration in pom.xml



    echo - Review error messages above for specific issues



    echo.



    echo If you see compilation errors, make sure:



    echo - Java JDK is installed (not just JRE)



    echo - JAVA_HOME environment variable is set



    echo - Java version matches project requirements



)



echo ==========================



echo 🛑 Script finished



echo ==========================



echo.



echo Press any key to exit...



pause >nul



exit /b %EXIT_CODE%`;



      



      // Add the batch script directly to the ZIP root



      finalZip.file('run-tests.bat', batchScript);



      



      // Create Unix shell script version



      const shellScript = `#!/bin/bash



set -e







echo "=========================="



echo "🛠 Automation Test Runner"



echo "=========================="



echo "Project: ${projectName}"



echo "Folder: ${folderName}"



echo "=========================="







# Get current directory (where this script is located)



SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"



echo "Current directory: $SCRIPT_DIR"







# Check if we're already in the project folder



if [ -f "$SCRIPT_DIR/pom.xml" ]; then



    echo "✅ Found pom.xml in current directory"



    PROJECT_DIR="$SCRIPT_DIR"



else



    # Look for pom.xml in subdirectories



    echo "Looking for pom.xml in subdirectories..."



    PROJECT_DIR=""



    for dir in "$SCRIPT_DIR"/*; do



        if [ -d "$dir" ] && [ -f "$dir/pom.xml" ]; then



            PROJECT_DIR="$dir"



            echo "✅ Found pom.xml in: $dir"



            break



        fi



    done



    



    # If not found, check Downloads folder



    if [ -z "$PROJECT_DIR" ]; then



        echo "No pom.xml found locally, checking Downloads folder..."



        DOWNLOADS_DIR="$HOME/Downloads"



        echo "Downloads folder: $DOWNLOADS_DIR"



        



        # Find latest ZIP file



        LATEST_ZIP=$(ls -t "$DOWNLOADS_DIR"/*.zip 2>/dev/null | head -n1)



        if [ -z "$LATEST_ZIP" ]; then



            echo "❌ No ZIP file found in $DOWNLOADS_DIR"



            read -p "Press Enter to exit..."



            exit 1



        fi



        echo "Latest ZIP found: $(basename "$LATEST_ZIP")"



        



        # Temp extraction folder



        TEMP_DIR="/tmp/automationRepo"



        rm -rf "$TEMP_DIR"



        mkdir -p "$TEMP_DIR"



        echo "Temp extraction folder: $TEMP_DIR"



        



        # Extract ZIP



        echo "Extracting ZIP..."



        unzip -q "$LATEST_ZIP" -d "$TEMP_DIR"



        



        # Find project folder with pom.xml



        PROJECT_DIR=$(find "$TEMP_DIR" -name "pom.xml" -type f | head -n1 | xargs dirname)



        if [ -z "$PROJECT_DIR" ]; then



            echo "❌ No project folder with pom.xml found!"



            read -p "Press Enter to exit..."



            exit 1



        fi



    fi



fi







echo "=========================="



echo "🚀 Starting Test Execution"



echo "=========================="



echo "Project directory: $PROJECT_DIR"







# Check if Maven is installed



if ! command -v mvn &> /dev/null; then



    echo "❌ Maven is not installed or not in PATH!"



    echo "Please install Maven first:"



    echo "- macOS: brew install maven"



    echo "- Ubuntu/Debian: sudo apt-get install maven"



    echo "- CentOS/RHEL: sudo yum install maven"



    read -p "Press Enter to exit..."



    exit 1



fi







# Run Maven tests



echo "Running Maven tests with verbose output..."



cd "$PROJECT_DIR"



mvn clean test -X



EXIT_CODE=$?







# Show result



echo "=========================="



if [ $EXIT_CODE -eq 0 ]; then



    echo "✅ Test execution completed successfully!"



else



    echo "❌ Test execution failed with exit code $EXIT_CODE"



fi



echo "=========================="



echo "🛑 Script finished"



echo "=========================="



read -p "Press Enter to exit..."



exit $EXIT_CODE`;



      



      // Add the shell script directly to the ZIP root



      finalZip.file('run-tests.sh', shellScript);



      



      // Get current user ID

      const { data: { user } } = await supabase.auth.getUser();

      

      // Create project info properties file

      const projectInfoProperties = `# Project Configuration Properties

# Generated on ${new Date().toISOString()}



project.name=${projectName}

project.id=${projectId}

user.id=${user?.id || 'Unknown'}

download.timestamp=${new Date().toISOString()}



# Test Execution Scripts

# Windows: run-tests.bat

# Mac/Linux: run-tests.sh

`;

      

      // Add project info properties file to the ZIP root

      finalZip.file('project.properties', projectInfoProperties);



      



      // Generate the final ZIP file

      const finalZipBlob = await finalZip.generateAsync({ 

        type: 'blob',

        compression: "DEFLATE",

        compressionOptions: { level: 6 }

      });

      

      // Download the ZIP file

      const zipUrl = URL.createObjectURL(finalZipBlob);

      const zipLink = document.createElement('a');

      zipLink.href = zipUrl;

      zipLink.download = `${folderName}.zip`;

      document.body.appendChild(zipLink);

      zipLink.click();

      document.body.removeChild(zipLink);

      URL.revokeObjectURL(zipUrl);

      

      // Extract and execute after download

      await extractAndExecute(finalZip, folderName);

      

      const totalFiles = Object.keys(finalZip.files).length;

      toast({
        title: "Success",
        description: `✅ Downloaded and extracted ${folderName}.zip with ${totalFiles} files! Attempting to execute tests automatically.`
      });



    } catch (error) {



      console.error('Error downloading repository:', error);



      toast({
        title: "Error",
        description: "Failed to download repository and temporary files",
        variant: "destructive"
      });



    }

  };



  const extractAndExecute = async (zipFile: JSZip, folderName: string) => {

    try {

      toast({
        title: "Info",
        description: "ZIP file downloaded successfully! Please follow the manual extraction steps."
      });

      

      // Always show manual instructions since File System Access API doesn't work in iframe contexts

      showManualInstructions(folderName);

      

    } catch (error) {

      console.error('Extract and execute error:', error);

      toast({
        title: "Error",
        description: "Failed to provide extraction instructions. Please extract the ZIP manually and run run-tests.bat",
        variant: "destructive"
      });

    }

  };



  const showManualInstructions = (folderName: string) => {

    toast({
      title: "Manual Extraction Required",
      description: `📁 Files downloaded as ${folderName}.zip\n\nManual steps:\n1. Extract the ZIP file to your Downloads folder\n2. Navigate to the extracted ${folderName} folder\n3. Double-click run-tests.bat (Windows) or run-tests.sh (Mac/Linux)\n4. Tests will execute automatically`
    });

  };



  const handleExecuteTests = async () => {



    if (!gitConfig.git_repository_url) {



      toast({
        title: "Error",
        description: "No repository connected",
        variant: "destructive"
      });



      return;



    }







    setDownloading(true);



    try {



      toast({
        title: "Downloading",
        description: "Downloading repository and temporary files for local testing..."
      });



      



      // First fetch temporary files to check how many we have



      const { data: tempFilesCheck, error: tempFilesCheckError } = await supabase



        .from("git_files")



        .select("file_path")



        .eq("project_id", projectId);







      if (tempFilesCheckError) {



        console.error("Error checking temporary files:", tempFilesCheckError);



      } else {



        console.log(`Found ${tempFilesCheck?.length || 0} temporary files to include`);



      }



      



      const { data, error } = await supabase.functions.invoke('repository-download', {



        body: { projectId }



      });







      if (error) throw error;

      if (data.success) {
        // Get project info from the edge function response
        const projectInfo = data.data;
        const repoName = projectInfo.repositoryUrl
          ?.split('/').pop()?.replace('.git', '') || 'repository';
        
        const projectName = projectInfo.projectName || repoName;

        toast({
          title: "Success",
          description: `Found ${projectInfo.fileCount} files. Preparing download...`
        });
        
        await downloadRepository('', repoName, projectName);
        
      } else {
        throw new Error(data.error || 'Repository download failed');
      }



    } catch (error) {



      console.error('Repository download error:', error);



      toast({
        title: "Error",
        description: error.message || 'Failed to download repository',
        variant: "destructive"
      });



    } finally {



      setDownloading(false);



    }



  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
                         <CardTitle className="flex items-center justify-between">



            <div className="flex items-center gap-2">



              <GitBranch className="h-5 w-5" />



              Git Repository



            </div>



            {gitConfig.git_repository_url && (



              <Button 



                onClick={handleExecuteTests}



                disabled={downloading}



                className="flex items-center gap-2"



              >



                <Download className="h-4 w-4" />



                {downloading ? "Downloading..." : "Download & Run Tests"}



              </Button>



            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {loading ? (
              "Loading repository details..."
            ) : gitConfig.git_repository_url ? (
              <>
                {gitConfig.git_repository_url} • Branch: {gitConfig.git_branch}
              </>
            ) : (
              "No repository connected. Use the Integrations module to connect a repository."
            )}
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="files" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="files" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Files
              </TabsTrigger>
              <TabsTrigger value="commits" className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Commits
              </TabsTrigger>
              <TabsTrigger value="execution" className="flex items-center gap-2">
                <PlayCircle className="h-4 w-4" />
                Execution Result
              </TabsTrigger>
            </TabsList>
            <TabsContent value="files" className="mt-6">
              <FileBrowser projectId={projectId} />
            </TabsContent>
            <TabsContent value="commits" className="mt-6">
              <GitHistory projectId={projectId} />
            </TabsContent>
            <TabsContent value="execution" className="mt-6">
              <ExecutionResult projectId={projectId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};