import { SHADCN_REGISTRY_NAMESPACE } from "@repo/config";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { Step, Steps } from "fumadocs-ui/components/steps";
import type { ReactNode } from "react";
import { ComponentSource } from "./component-source";
import { PackageManagerTabs } from "./package-manager-tabs";
import { getRegistryItem, REGISTRY_URL } from "./registry-data";

function StepBlock({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <Step>
      <div className="flex flex-col gap-3 pb-8">
        <p className="flex min-h-8 items-center font-medium text-fd-foreground">
          {title}
        </p>
        {children}
      </div>
    </Step>
  );
}

/**
 * CLI | Manual installation for a registry item, read from registry.json. The
 * CLI tab gives the @qrdx name, then the full URL for CLIs before 3.7.0.
 */
export function InstallationTabs({ name }: { name: string }) {
  const item = getRegistryItem(name);
  const dependencies = item.dependencies ?? [];
  const primitives = (item.registryDependencies ?? []).filter(
    (dependency) => !dependency.startsWith("http"),
  );

  return (
    <Tabs className="not-prose my-6 gap-3" defaultValue="cli">
      <TabsList>
        <TabsTrigger value="cli">CLI</TabsTrigger>
        <TabsTrigger value="manual">Manual</TabsTrigger>
      </TabsList>
      <TabsContent className="space-y-3" value="cli">
        <PackageManagerTabs
          className="my-0"
          command={`npx shadcn@latest add ${SHADCN_REGISTRY_NAMESPACE}/${name}`}
        />
        <p className="text-fd-muted-foreground text-sm">
          Or by URL, which works with older versions of the CLI too:
        </p>
        <PackageManagerTabs
          className="my-0"
          command={`npx shadcn@latest add ${REGISTRY_URL}/${name}.json`}
        />
      </TabsContent>
      <TabsContent className="pt-4" value="manual">
        <Steps>
          {dependencies.length > 0 ? (
            <StepBlock title="Install the dependencies">
              <PackageManagerTabs
                className="my-0"
                command={`npm install ${dependencies.join(" ")}`}
              />
            </StepBlock>
          ) : null}
          {primitives.length > 0 ? (
            <StepBlock title="Add the shadcn/ui components it uses">
              <PackageManagerTabs
                className="my-0"
                command={`npx shadcn@latest add ${primitives.join(" ")}`}
              />
            </StepBlock>
          ) : null}
          <StepBlock title="Copy and paste the following code into your project">
            <ComponentSource name={name} />
          </StepBlock>
          <StepBlock title="Update the import paths to match your project setup" />
        </Steps>
      </TabsContent>
    </Tabs>
  );
}
