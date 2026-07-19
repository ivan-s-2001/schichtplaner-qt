"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  InlineNotice,
  Input,
  MetricBlock,
  MetricGrid,
  NativeSelect,
  PageHeader,
  PageToolbar,
  StatePanel,
  Tab,
  Tabs,
  Textarea,
} from "@qt/outline-ui";

export default function UiKitPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("components");

  return (
    <div className="qto-root space-y-8">
      <PageHeader
        title="Outline UI"
        description="Каталог общего интерфейсного фреймворка QuickTickets."
        actions={<Button onClick={() => setDialogOpen(true)}>Открыть диалог</Button>}
      />

      <Tabs aria-label="Разделы каталога">
        <Tab active={activeTab === "components"} onClick={() => setActiveTab("components")}>
          Компоненты
        </Tab>
        <Tab active={activeTab === "states"} onClick={() => setActiveTab("states")}>
          Состояния
        </Tab>
        <Tab active={activeTab === "tokens"} onClick={() => setActiveTab("tokens")}>
          Токены
        </Tab>
      </Tabs>

      <PageToolbar>
        <div className="flex flex-wrap gap-2">
          <Button>Основная</Button>
          <Button variant="outline">Нейтральная</Button>
          <Button variant="secondary">Вторичная</Button>
          <Button variant="ghost">Без фона</Button>
          <Button variant="destructive">Опасная</Button>
        </div>
        <div className="flex gap-2">
          <Badge>Черновик</Badge>
          <Badge variant="outline">Опубликовано</Badge>
        </div>
      </PageToolbar>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Поля</CardTitle>
              <CardDescription>Геометрия и состояния из Outline.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Название" description="Обычное текстовое поле">
              <Input placeholder="Введите название" />
            </Field>
            <Field label="Подразделение">
              <NativeSelect defaultValue="support">
                <option value="support">Служба заботы</option>
                <option value="accounting">Бухгалтерия</option>
              </NativeSelect>
            </Field>
            <Field label="Комментарий">
              <Textarea placeholder="Комментарий" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Метрики</CardTitle>
              <CardDescription>Плоские блоки без декоративных карточек.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <MetricGrid>
              <MetricBlock label="Сотрудники" value="28" />
              <MetricBlock label="Смены" value="112" />
              <MetricBlock label="Отклонения" value="3" tone="danger" />
              <MetricBlock label="Отпуска" value="7" />
            </MetricGrid>
          </CardContent>
        </Card>
      </div>

      <InlineNotice>
        Общие элементы добавляются в пакет, а не копируются между страницами Schedule.
      </InlineNotice>

      <StatePanel
        title="Нет данных"
        description="Пустые состояния всех разделов используют один компонент."
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div>
              <DialogTitle>Пример диалога</DialogTitle>
              <DialogDescription>
                Размеры, отступы и тени соответствуют диалогам Outline.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody>
            <Field label="Название смены">
              <Input defaultValue="Дневная смена" />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Сохранить</Button>
            </DialogFooter>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
